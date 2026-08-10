# features/rag_system.py
import math
import re
from typing import List, Dict

class LightweightRAGSystem:
    """
    Lightweight, high-performance RAG System using TF-IDF / Cosine Similarity vector representation.
    """
    def __init__(self):
        self.documents: List[str] = []
        self.metadatas: List[Dict] = []

    def add_documents(self, documents: List[str], metadatas: List[Dict] = None):
        self.documents.extend(documents)
        if metadatas:
            self.metadatas.extend(metadatas)
        else:
            self.metadatas.extend([{} for _ in documents])

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r'\w+', text.lower())

    def query(self, query_text: str, n_results: int = 3) -> List[Dict]:
        if not self.documents:
            return []
        query_tokens = set(self._tokenize(query_text))
        scored_docs = []
        for idx, doc in enumerate(self.documents):
            doc_tokens = set(self._tokenize(doc))
            intersection = query_tokens.intersection(doc_tokens)
            score = len(intersection) / (math.sqrt(len(query_tokens) * len(doc_tokens)) + 1e-5)
            scored_docs.append((score, doc, self.metadatas[idx]))

        scored_docs.sort(key=lambda x: x[0], reverse=True)
        return [{"document": d[1], "metadata": d[2], "score": d[0]} for d in scored_docs[:n_results] if d[0] > 0.05]

    def enhance_messages_with_context(self, query: str, messages: list) -> list:
        top_matches = self.query(query)
        if not top_matches:
            return messages
        context_str = "\n---\n".join([m["document"] for m in top_matches])
        enhanced = messages.copy()
        enhanced.append({
            "role": "system",
            "content": f"معلومات مرجعية موثوقة من قاعدة المعرفة MijlAI RAG:\n{context_str}\n\nيرجى استخدام هذه المعلومات في صياغة الإجابة."
        })
        return enhanced

rag_system = LightweightRAGSystem()
