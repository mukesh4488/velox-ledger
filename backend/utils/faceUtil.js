function cosineSimilarity(embedding1, embedding2) {
  if (!Array.isArray(embedding1) || !Array.isArray(embedding2) || embedding1.length !== embedding2.length || embedding1.length === 0) return -1;
  let dot = 0, norm1 = 0, norm2 = 0;
  for (let i = 0; i < embedding1.length; i += 1) {
    const a = Number(embedding1[i]); const b = Number(embedding2[i]);
    dot += a * b; norm1 += a * a; norm2 += b * b;
  }
  if (!norm1 || !norm2) return -1;
  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
function cosineDistance(a, b) { const s = cosineSimilarity(a, b); return s < -0.5 ? Infinity : 1 - s; }
function findBestMatch(targetEmbedding, customers, threshold = 0.6) {
  let best = null; let bestSimilarity = -1;
  // FACE_RECOGNITION_THRESHOLD is historically configured as cosine distance.
  // Convert it to the equivalent similarity floor so existing .env values keep working.
  const similarityFloor = 1 - Number(threshold);
  for (const customer of customers || []) {
    if (!customer.faceRegistered || !Array.isArray(customer.faceEmbedding) || !customer.faceEmbedding.length) continue;
    const similarity = cosineSimilarity(targetEmbedding, customer.faceEmbedding);
    if (similarity >= similarityFloor && similarity > bestSimilarity) { best = customer; bestSimilarity = similarity; }
  }
  return best;
}
module.exports = { cosineSimilarity, cosineDistance, findBestMatch };
