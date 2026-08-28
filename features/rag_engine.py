"""
Arabic-first local RAG — fastembed (CPU, no API keys) + sqlite-vec + BM25.

Enhancements over the classic pipeline:
1. Arabic text normalization (diacritics/tatweel removal, alef/ya/ta-marbuta
   unification for the lexical index) so Arabic queries match reliably.
2. Semantic chunking: paragraph → sentence boundaries (Arabic + Latin) with
   sentence-level overlap instead of blind fixed-size slicing.
3. Hybrid retrieval: dense vectors (multilingual-e5-small) fused with lexical
   BM25 via Reciprocal Rank Fusion — robust for exact names AND meaning.
"""
import json
import logging
import math
import re
import sqlite3
from collections import defaultdict
from typing import Dict, List, Tuple

logger = logging.getLogger("rag")

# Multilingual MiniLM: 384-dim, 0.22GB, strong Arabic semantic similarity.
EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBED_DIM = 384
CHUNK_SIZE = 700      # target characters per chunk
CHUNK_OVERLAP = 1     # overlap measured in SENTENCES

_embedder = None


# ==========================================
# Arabic normalization
# ==========================================
_AR_DIACRITICS_RE = re.compile(
    "[" "\u064B-\u0652" "\u0670" "\u0640" "]"
)  # tanween + harakat + dagger alif + tatweel
_AR_ALEF_RE = re.compile(r"[أإآٱﺎ]")


def normalize_arabic(text: str, full: bool = False) -> str:
    """Light normalization (embeddings): strip diacritics/tatweel.
    Full normalization (BM25): additionally unify alef variants, ya, ta-marbuta."""
    if not text:
        return ""
    out = _AR_DIACRITICS_RE.sub("", text)
    if full:
        out = _AR_ALEF_RE.sub("ا", out)
        out = out.replace("ى", "ي")
        out = out.replace("ة", "ه")
        out = re.sub(r"\s+", " ", out)
    return out.strip()


_TOKEN_RE = re.compile(r"[\w\u0621-\u064A]+", re.UNICODE)


def tokenize(text: str) -> List[str]:
    return _TOKEN_RE.findall(normalize_arabic(text.lower(), full=True))


# ==========================================
# Embeddings
# ==========================================
def _get_embedder():
    global _embedder
    if _embedder is None:
        from fastembed import TextEmbedding
        _embedder = TextEmbedding(model_name=EMBED_MODEL)
    return _embedder


def embed_texts(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []
    # MiniLM is symmetric (no query/passage prefixes); light normalization only.
    prepared = [normalize_arabic(t) for t in texts]
    return [list(map(float, e)) for e in _get_embedder().embed(prepared)]


def embed_query(text: str) -> List[float]:
    return embed_texts([text])[0]


# ==========================================
# Semantic chunking (Arabic-aware)
# ==========================================
_SENT_SPLIT_RE = re.compile(r"(?<=[.!؟?؛\n])\s+")
_PARA_SPLIT_RE = re.compile(r"\n\s*\n")


def _split_sentences(text: str) -> List[str]:
    sentences: List[str] = []
    for para in _PARA_SPLIT_RE.split(text):
        para = para.strip()
        if not para:
            continue
        parts = [s.strip() for s in _SENT_SPLIT_RE.split(para) if s.strip()]
        sentences.extend(parts if parts else [para])
    return sentences


def chunk_text(text: str) -> List[str]:
    """Semantic chunks: merge whole sentences up to ~CHUNK_SIZE chars, carrying
    the last sentence into the next chunk for cross-boundary context."""
    text = (text or "").strip()
    if not text:
        return []
    sentences = _split_sentences(text)
    if not sentences:
        return []

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for sentence in sentences:
        # Sentence longer than the target: emit as its own chunk(s) by size.
        if len(sentence) > CHUNK_SIZE * 1.6:
            if current:
                chunks.append(" ".join(current))
                current, current_len = [], 0
            for start in range(0, len(sentence), CHUNK_SIZE - 80):
                piece = sentence[start:start + CHUNK_SIZE].strip()
                if len(piece) > 20:
                    chunks.append(piece)
            continue

        if current_len + len(sentence) + 1 > CHUNK_SIZE and current:
            chunks.append(" ".join(current))
            # Sentence-level overlap for continuity
            current = [current[-1], sentence] if CHUNK_OVERLAP else [sentence]
            current_len = sum(len(s) for s in current) + len(current) - 1
        else:
            current.append(sentence)
            current_len += len(sentence) + 1

    if current:
        chunks.append(" ".join(current))

    return [c for c in chunks if len(c) > 20]


# ==========================================
# BM25 (pure Python, personal-KB scale)
# ==========================================
def _bm25_rank(query: str, docs: List[str], k1: float = 1.5, b: float = 0.75) -> List[Tuple[int, float]]:
    q_terms = tokenize(query)
    if not q_terms or not docs:
        return []
    doc_tokens = [tokenize(d) for d in docs]
    doc_lens = [len(t) for t in doc_tokens]
    avgdl = sum(doc_lens) / len(doc_lens) if doc_lens else 1.0

    # document frequency
    df: Dict[str, int] = defaultdict(int)
    for toks in doc_tokens:
        for t in set(toks):
            df[t] += 1
    n_docs = len(docs)

    scores: List[Tuple[int, float]] = []
    for idx, toks in enumerate(doc_tokens):
        if not toks:
            scores.append((idx, 0.0))
            continue
        tf_map: Dict[str, int] = defaultdict(int)
        for t in toks:
            tf_map[t] += 1
        score = 0.0
        for term in q_terms:
            if term not in df:
                continue
            idf = math.log(1 + (n_docs - df[term] + 0.5) / (df[term] + 0.5))
            tf = tf_map.get(term, 0)
            denom = tf + k1 * (1 - b + b * doc_lens[idx] / (avgdl or 1.0))
            score += idf * (tf * (k1 + 1)) / (denom or 1.0)
        scores.append((idx, score))
    return scores


def _rrf_fuse(rankings: List[List[int]], k: int = 60) -> List[Tuple[int, float]]:
    """Reciprocal Rank Fusion over lists of doc indices (best-first)."""
    fused: Dict[int, float] = defaultdict(float)
    for ranking in rankings:
        for rank, doc_idx in enumerate(ranking):
            fused[doc_idx] += 1.0 / (k + rank + 1)
    return sorted(fused.items(), key=lambda kv: kv[1], reverse=True)


# ==========================================
# Embedding compatibility migration (model switches re-embed existing chunks)
# ==========================================
def _ensure_embedding_compat(conn: sqlite3.Connection) -> None:
    row = conn.cursor().execute("SELECT embedding FROM rag_chunks LIMIT 1").fetchone()
    if not row:
        return
    try:
        dim = len(json.loads(row[0]))
    except Exception:
        return
    if dim == EMBED_DIM:
        return
    logger.warning(f"RAG embedding dim mismatch (stored={dim}, model={EMBED_DIM}) — re-embedding all chunks…")
    cur = conn.cursor()
    chunks = cur.execute("SELECT id, text FROM rag_chunks").fetchall()
    for chunk_id, text in chunks:
        vec = embed_texts([text])[0]
        cur.execute("UPDATE rag_chunks SET embedding = ? WHERE id = ?", (json.dumps(vec), chunk_id))
    conn.commit()
    logger.info(f"Re-embedded {len(chunks)} chunks with {EMBED_MODEL}")


# ==========================================
# Public API
# ==========================================
def ingest_document(conn: sqlite3.Connection, user_id: str, name: str, text: str) -> int:
    """Chunk + embed + store. Returns number of chunks stored.
    Retrieval is brute-force numpy cosine fused with BM25 — at personal-KB scale
    (thousands of chunks) this is milliseconds and keeps ONE consistent store."""
    _ensure_embedding_compat(conn)
    chunks = chunk_text(text)
    if not chunks:
        return 0
    vectors = embed_texts(chunks)

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO rag_documents (user_id, name, chunk_count) VALUES (?, ?, ?)",
        (user_id, name[:200], len(chunks))
    )
    doc_id = cur.lastrowid
    for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
        cur.execute(
            "INSERT INTO rag_chunks (doc_id, user_id, chunk_index, text, embedding) VALUES (?, ?, ?, ?, ?)",
            (doc_id, user_id, idx, chunk, json.dumps(vec))
        )
    return len(chunks)


def query_knowledge(conn: sqlite3.Connection, user_id: str, question: str, top_k: int = 5) -> List[Tuple[str, float, str]]:
    """Hybrid retrieval: dense vectors + BM25 fused via RRF.
    Returns [(chunk_text, fused_score, doc_name)]."""
    import numpy as np
    _ensure_embedding_compat(conn)

    rows = conn.cursor().execute(
        """SELECT rc.id, rc.text, rc.embedding, rd.name FROM rag_chunks rc
           JOIN rag_documents rd ON rd.id = rc.doc_id
           WHERE rc.user_id = ? LIMIT 20000""",
        (user_id,)
    ).fetchall()
    if not rows:
        return []

    ids, texts, names = [], [], []
    vecs = []
    for row_id, text, emb, name in rows:
        try:
            v = np.array(json.loads(emb), dtype=np.float32)
        except Exception:
            continue
        if v.shape[0] != EMBED_DIM:
            continue
        ids.append(row_id); texts.append(text); vecs.append(v); names.append(name)
    if not vecs:
        return []

    # --- dense ranking ---
    qvec = np.array(embed_query(question), dtype=np.float32)
    mat = np.stack(vecs)
    qn = qvec / (np.linalg.norm(qvec) + 1e-9)
    mn = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-9)
    dense_scores = mn @ qn
    dense_ranking = list(np.argsort(-dense_scores))

    # --- lexical ranking (BM25 over normalized Arabic tokens) ---
    bm25_scores = _bm25_rank(question, texts)
    bm25_ranking = [idx for idx, s in sorted(bm25_scores, key=lambda kv: kv[1], reverse=True) if s > 0]

    # --- fuse ---
    fused = _rrf_fuse([dense_ranking, bm25_ranking])[:top_k]
    return [(texts[i], float(score), names[i]) for i, score in fused]


def list_documents(conn: sqlite3.Connection, user_id: str) -> List[dict]:
    rows = conn.cursor().execute(
        "SELECT id, name, chunk_count, created_at FROM rag_documents WHERE user_id = ? ORDER BY id DESC",
        (user_id,)
    ).fetchall()
    return [dict(zip(("id", "name", "chunk_count", "created_at"), r)) for r in rows]


def delete_document(conn: sqlite3.Connection, user_id: str, doc_id: int) -> bool:
    cur = conn.cursor()
    owned = cur.execute(
        "SELECT id FROM rag_documents WHERE id = ? AND user_id = ?", (doc_id, user_id)
    ).fetchone()
    if not owned:
        return False
    cur.execute("DELETE FROM rag_chunks WHERE doc_id = ?", (doc_id,))
    cur.execute(f"DROP TABLE IF EXISTS rag_vec_{doc_id}")
    cur.execute("DELETE FROM rag_documents WHERE id = ?", (doc_id,))
    return True
