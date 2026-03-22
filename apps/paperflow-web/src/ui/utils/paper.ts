type PaperSpec = { title: string; pdfUrl: string };

const PAPER_LIBRARY: PaperSpec[] = [
  { title: "Attention Is All You Need", pdfUrl: "https://arxiv.org/pdf/1706.03762.pdf" },
  { title: "BERT: Pre-training of Deep Bidirectional Transformers", pdfUrl: "https://arxiv.org/pdf/1810.04805.pdf" },
  { title: "Language Models are Few-Shot Learners", pdfUrl: "https://arxiv.org/pdf/2005.14165.pdf" }
];

export function resolvePaperPdf(postId: string): PaperSpec {
  if (!postId) return PAPER_LIBRARY[0];
  let checksum = 0;
  for (let i = 0; i < postId.length; i += 1) {
    checksum = (checksum + postId.charCodeAt(i)) % 2147483647;
  }
  return PAPER_LIBRARY[checksum % PAPER_LIBRARY.length];
}
