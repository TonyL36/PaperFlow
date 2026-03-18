import asyncio
import importlib
import json
import sys
from pathlib import Path
from typing import Any


class MinerUAdapter:
    async def parse_pdf(self, pdf_path: str, output_dir: str) -> dict[str, Any]:
        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        mineru_exe = Path(sys.executable).parent / "mineru.exe"
        attempts = [
            [str(mineru_exe), "-p", pdf_path, "-o", output_dir, "-b", "pipeline", "-d", "cuda:0"],
            [str(mineru_exe), "-p", pdf_path, "-o", output_dir, "-b", "pipeline", "-d", "cuda"],
            [str(mineru_exe), "-p", pdf_path, "-o", output_dir],
            [str(mineru_exe), "--input", pdf_path, "--output", output_dir],
            ["mineru", "-p", pdf_path, "-o", output_dir, "-b", "pipeline", "-d", "cuda:0"],
            ["mineru", "-p", pdf_path, "-o", output_dir, "-b", "pipeline", "-d", "cuda"],
            ["mineru", "-p", pdf_path, "-o", output_dir],
            ["mineru", "--input", pdf_path, "--output", output_dir],
        ]
        last_error = ""
        command_errors: list[str] = []
        for cmd in attempts:
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await proc.communicate()
                if proc.returncode != 0:
                    last_error = (stderr or stdout).decode("utf-8", errors="ignore").strip()
                    command_errors.append(f'{" ".join(cmd[:3])}: {last_error}')
                    continue
                parsed = self._read_output_json(out_dir)
                if parsed:
                    return parsed
                command_errors.append(f'{" ".join(cmd[:3])}: 命令执行成功但未找到JSON输出')
            except FileNotFoundError:
                last_error = f"命令不存在: {cmd[0]}"
                command_errors.append(last_error)
                continue
            except Exception as e:
                last_error = str(e)
                command_errors.append(last_error)
                continue
        try:
            parsed_from_api = await asyncio.to_thread(self._parse_by_python_api, pdf_path, output_dir)
            if parsed_from_api:
                return parsed_from_api
        except Exception as e:
            last_error = str(e)
            command_errors.append(last_error)
        merged_error = "; ".join(command_errors[-4:])
        raise RuntimeError(f"MinerU 解析失败: {merged_error or last_error or '未找到可用输出'}")

    def _parse_by_python_api(self, pdf_path: str, output_dir: str) -> dict[str, Any] | None:
        api_candidates = [
            ("mineru", "parse_pdf"),
        ]
        for module_name, func_name in api_candidates:
            try:
                module = importlib.import_module(module_name)
            except Exception:
                continue
            fn = getattr(module, func_name, None)
            if not callable(fn):
                continue
            call_styles = [
                lambda: fn(pdf_path, output_dir),
                lambda: fn(pdf_path=pdf_path, output_dir=output_dir),
                lambda: fn(input_path=pdf_path, output_dir=output_dir),
                lambda: fn(input_file=pdf_path, output_dir=output_dir),
            ]
            for call in call_styles:
                try:
                    result = call()
                except Exception:
                    continue
                normalized = self._normalize_api_result(result, output_dir)
                if normalized:
                    return normalized
        parsed = self._read_output_json(Path(output_dir))
        return parsed

    def _normalize_api_result(self, result: Any, output_dir: str) -> dict[str, Any] | None:
        if isinstance(result, dict):
            return {"source_file": "python_api", "data": result}
        if isinstance(result, list):
            return {"source_file": "python_api", "data": result}
        if isinstance(result, str):
            path = Path(result)
            if path.exists() and path.suffix.lower() == ".json":
                content = json.loads(path.read_text(encoding="utf-8"))
                return {"source_file": str(path), "data": content}
        parsed = self._read_output_json(Path(output_dir))
        return parsed

    def _read_output_json(self, out_dir: Path) -> dict[str, Any] | None:
        candidates = []
        for pattern in ["*.json", "**/*.json"]:
            candidates.extend(out_dir.glob(pattern))
        candidates = [p for p in candidates if p.is_file()]
        if not candidates:
            return None
        
        # 显式优先读取 middle.json (包含最完整的 preproc_blocks 结构)
        middle_jsons = [p for p in candidates if p.name.endswith("_middle.json")]
        if middle_jsons:
            middle_jsons.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            for path in middle_jsons:
                try:
                    content = path.read_text(encoding="utf-8")
                    data = json.loads(content)
                    if isinstance(data, dict) or isinstance(data, list):
                        print(f"Loaded JSON from: {path}", flush=True)
                        return {"source_file": str(path), "data": data}
                except Exception:
                    continue

        # 其次读取 model.json (通常只含 layout_dets)
        model_jsons = [p for p in candidates if p.name.endswith("model.json")]
        if model_jsons:
            model_jsons.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            for path in model_jsons:
                try:
                    content = path.read_text(encoding="utf-8")
                    data = json.loads(content)
                    if isinstance(data, dict) or isinstance(data, list):
                        print(f"Loaded JSON from: {path}", flush=True)
                        return {"source_file": str(path), "data": data}
                except Exception:
                    continue

        candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for path in candidates:
            try:
                content = path.read_text(encoding="utf-8")
                data = json.loads(content)
                if isinstance(data, dict) or isinstance(data, list):
                    print(f"Loaded JSON from: {path}", flush=True)
                    return {"source_file": str(path), "data": data}
            except Exception:
                continue
        return None
