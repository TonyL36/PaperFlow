import { useEffect, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export type UsePdfDocumentResult = {
  doc: PDFDocumentProxy | null;
  error: unknown | null;
  loading: boolean;
};

export function usePdfDocument(renderPdfUrl: string): UsePdfDocumentResult {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!renderPdfUrl) {
      setDoc(null);
      setError(new Error("该文章未提供可用 PDF 链接"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadingTask = getDocument({ url: renderPdfUrl, withCredentials: false });
    setDoc(null);
    setError(null);
    setLoading(true);

    loadingTask.promise
      .then((nextDoc) => {
        if (cancelled) {
          void nextDoc.destroy();
          return;
        }
        setDoc(nextDoc);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [renderPdfUrl]);

  return { doc, error, loading };
}
