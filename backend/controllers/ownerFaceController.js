const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const { findBestMatch, cosineSimilarity } = require('../utils/faceUtil');

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL || 'http://127.0.0.1:5001';
const FACE_RECOGNITION_THRESHOLD = parseFloat(process.env.FACE_RECOGNITION_THRESHOLD || '0.6');

const axios = require('axios');
const FormData = require('form-data');

async function callPythonFaceService(buffer, originalname, mimetype, endpoint = '/extract-embedding', timeoutMs = 15000) {
  try {
    const formData = new FormData();
    formData.append('file', buffer, { filename: originalname || 'face.jpg', contentType: mimetype || 'image/jpeg' });
    const response = await axios.post(`${FACE_SERVICE_URL}${endpoint}`, formData, {
      headers: formData.getHeaders(),
      timeout: timeoutMs,
      validateStatus: () => true // Allow us to handle non-200 status codes manually
    });
    
    if (response.status !== 200) {
      throw new Error(response.data?.message || `Face service returned HTTP ${response.status}.`);
    }
    
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') throw new Error('Python face service timed out.');
    if (error.message?.startsWith('Face service returned')) throw error;
    throw new Error('Could not connect to Python face service: ' + error.message);
  }
}

exports.registerFace = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    if (!customer.isActive) return res.status(400).json({ success: false, message: 'Cannot register face for an inactive customer.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided.' });

    let pythonRes;
    try { pythonRes = await callPythonFaceService(req.file.buffer, req.file.originalname, req.file.mimetype); }
    catch (e) { return res.status(503).json({ success: false, message: e.message }); }

    if (pythonRes.faceCount === 0) return res.status(400).json({ success: false, message: 'No face detected.' });
    if (pythonRes.faceCount > 1) return res.status(400).json({ success: false, message: 'Multiple faces detected. Please ensure only one person is visible.' });
    if (!pythonRes.success || !pythonRes.embedding) return res.status(400).json({ success: false, message: pythonRes.message || 'Face extraction failed.' });

    customer.faceEmbedding = pythonRes.embedding;
    customer.faceRegistered = true;
    await customer.save();
    res.json({ success: true, message: 'Face registered successfully.', customer: { id: customer._id, name: customer.name, phone: customer.phone, faceRegistered: true } });
  } catch (error) { next(error); }
};

exports.recognizeFace = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided.' });
    let pythonRes;
    try { pythonRes = await callPythonFaceService(req.file.buffer, req.file.originalname, req.file.mimetype); }
    catch (e) { return res.status(503).json({ success: false, message: e.message }); }
    if (pythonRes.faceCount === 0) return res.status(404).json({ success: false, message: 'Customer not recognized. No face detected.' });
    if (pythonRes.faceCount > 1) return res.status(400).json({ success: false, message: 'Multiple faces detected. Use the live multi-face scanner for a group.' });
    if (!pythonRes.success || !pythonRes.embedding) return res.status(400).json({ success: false, message: pythonRes.message || 'Face extraction failed.' });

    const customers = await Customer.find({ isActive: true, faceRegistered: true }).select('name phone faceEmbedding faceRegistered');
    const bestMatch = findBestMatch(pythonRes.embedding, customers, FACE_RECOGNITION_THRESHOLD);
    if (!bestMatch) return res.status(404).json({ success: false, message: 'Customer not recognized.' });
    res.json({ success: true, message: 'Customer recognized.', customer: { id: bestMatch._id, name: bestMatch.name, phone: bestMatch.phone, faceRegistered: true } });
  } catch (error) { next(error); }
};

exports.scanFaces = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided.' });
    let pythonRes;
    try { pythonRes = await callPythonFaceService(req.file.buffer, req.file.originalname, req.file.mimetype, '/extract-embeddings', 25000); }
    catch (e) { return res.status(503).json({ success: false, message: e.message }); }

    if (!pythonRes.success && Number(pythonRes.faceCount || 0) === 0) return res.json({ success: true, faceCount: 0, faces: [] });
    const faces = Array.isArray(pythonRes.faces) ? pythonRes.faces : [];
    if (!faces.length) return res.json({ success: true, faceCount: 0, faces: [] });

    const customers = await Customer.find({ isActive: true, faceRegistered: true }).select('name phone email faceEmbedding faceRegistered').lean();
    const matches = faces.map((face, index) => {
      const embedding = Array.isArray(face.embedding) ? face.embedding : [];
      const match = findBestMatch(embedding, customers, FACE_RECOGNITION_THRESHOLD);
      return {
        faceId: index,
        face,
        match,
        similarity: match ? cosineSimilarity(embedding, match.faceEmbedding) : null,
      };
    });

    // One transaction query for the whole frame instead of one query per face.
    const matchedIds = [...new Set(matches.filter(x => x.match).map(x => String(x.match._id)))];
    const txns = matchedIds.length ? await Transaction.find({ customerId: { $in: matchedIds } }).select('customerId type amount').lean() : [];
    const totals = new Map();
    for (const txn of txns) {
      const key = String(txn.customerId);
      const current = totals.get(key) || { debt: 0, payment: 0 };
      if (txn.type === 'DEBT') current.debt += Number(txn.amount || 0);
      else current.payment += Number(txn.amount || 0);
      totals.set(key, current);
    }

    const results = matches.map(({ faceId, face, match, similarity }) => {
      let customer = null;
      if (match) {
        const totalsForCustomer = totals.get(String(match._id)) || { debt: 0, payment: 0 };
        const balance = Math.round((totalsForCustomer.debt - totalsForCustomer.payment) * 100) / 100;
        customer = {
          id: match._id,
          name: match.name,
          phone: match.phone,
          email: match.email || null,
          balance,
          isAdvance: balance < 0,
          totalDebt: totalsForCustomer.debt,
          totalPayment: totalsForCustomer.payment,
          faceRegistered: true,
        };
      }
      return {
        faceId,
        box: face.facialArea || { x: 0, y: 0, w: 0, h: 0 },
        confidence: Number(face.faceConfidence || face.confidence || 0),
        recognized: Boolean(customer),
        similarity: similarity === null ? null : Number(similarity.toFixed(4)),
        customer,
      };
    });

    res.json({ success: true, faceCount: results.length, recognizedCount: results.filter(x => x.recognized).length, faces: results });
  } catch (error) { next(error); }
};
