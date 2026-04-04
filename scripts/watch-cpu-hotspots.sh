#!/usr/bin/env bash
set -euo pipefail

INTERVAL="${INTERVAL:-15}"
SAMPLES="${SAMPLES:-240}"
CPU_THRESHOLD="${CPU_THRESHOLD:-85}"
OUT_DIR="${OUT_DIR:-/tmp/paperflow-monitor}"
mkdir -p "$OUT_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$OUT_DIR/cpu-hotspots-$TS.log"
CSV_FILE="$OUT_DIR/cpu-hotspots-$TS.csv"
ALERT_FILE="$OUT_DIR/cpu-hotspots-alert-$TS.log"

echo "timestamp,host_cpu_used_pct,top_process_pid,top_process_cpu,top_process_mem,top_process_cmd,top_container_name,top_container_cpu,top_container_mem" > "$CSV_FILE"

sample_host_cpu() {
  local idle
  idle="$(top -bn2 -d 0.2 | awk '/Cpu\(s\)|%Cpu\(s\)/ {v=$8} END {gsub(/,/, ".", v); print v+0}')"
  awk -v i="$idle" 'BEGIN {printf "%.2f", 100 - i}'
}

sample_top_process() {
  ps -eo pid,pcpu,pmem,cmd --sort=-pcpu \
    | grep -Ev 'watch-cpu-hotspots\.sh|docker stats|top -bn2|awk ' \
    | sed -n '1p'
}

sample_top_container() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "no-docker|0.00%|0B / 0B"
    return
  fi
  local line
  line="$(docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' \
    | awk -F'|' '{gsub(/%/,"",$2); print $0}' \
    | sort -t'|' -k2,2nr \
    | sed -n '1p')"
  if [ -z "$line" ]; then
    echo "no-container|0.00%|0B / 0B"
    return
  fi
  echo "$line"
}

echo "log_file=$LOG_FILE"
echo "csv_file=$CSV_FILE"
echo "alert_file=$ALERT_FILE"
echo "interval=$INTERVAL samples=$SAMPLES cpu_threshold=$CPU_THRESHOLD"

for i in $(seq 1 "$SAMPLES"); do
  now="$(date '+%F %T')"
  host_cpu="$(sample_host_cpu)"
  proc_line="$(sample_top_process)"
  proc_pid="$(echo "$proc_line" | awk '{print $1}')"
  proc_cpu="$(echo "$proc_line" | awk '{print $2}')"
  proc_mem="$(echo "$proc_line" | awk '{print $3}')"
  proc_cmd="$(echo "$proc_line" | cut -d' ' -f4- | tr ',' ';')"
  container_line="$(sample_top_container)"
  container_name="$(echo "$container_line" | cut -d'|' -f1)"
  container_cpu="$(echo "$container_line" | cut -d'|' -f2 | tr -d '%')"
  container_mem="$(echo "$container_line" | cut -d'|' -f3 | tr ',' ';')"

  echo "$now host_cpu=${host_cpu}% top_proc_pid=$proc_pid proc_cpu=${proc_cpu}% proc_mem=${proc_mem}% top_container=$container_name container_cpu=${container_cpu}% container_mem=$container_mem" | tee -a "$LOG_FILE"
  echo "$now,$host_cpu,$proc_pid,$proc_cpu,$proc_mem,\"$proc_cmd\",$container_name,$container_cpu,\"$container_mem\"" >> "$CSV_FILE"

  alert=0
  if awk -v a="$host_cpu" -v b="$CPU_THRESHOLD" 'BEGIN{exit !(a>=b)}'; then
    alert=1
  fi
  if awk -v a="$container_cpu" -v b="$CPU_THRESHOLD" 'BEGIN{exit !(a>=b)}'; then
    alert=1
  fi

  if [ "$alert" -eq 1 ]; then
    echo "$now ALERT host_cpu=${host_cpu}% proc_pid=$proc_pid proc_cpu=${proc_cpu}% container=$container_name container_cpu=${container_cpu}%" | tee -a "$ALERT_FILE"
  fi

  sleep "$INTERVAL"
done

echo "done"
echo "log_file=$LOG_FILE"
echo "csv_file=$CSV_FILE"
echo "alert_file=$ALERT_FILE"
