import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Camera, Check, ChevronRight, CircleDollarSign, ExternalLink, Loader2, RefreshCw, ScanFace, ShieldCheck, UserRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

function Box({ face, selected, onSelect, videoSize, stageSize }) {
  const { width: vw, height: vh } = videoSize;
  const { width: sw, height: sh } = stageSize;
  if (!vw || !vh || !sw || !sh) return null;
  const scale = Math.max(sw / vw, sh / vh);
  const renderedW = vw * scale;
  const renderedH = vh * scale;
  const offsetX = (sw - renderedW) / 2;
  const offsetY = (sh - renderedH) / 2;
  const area = face.box || {};
  const left = sw - (offsetX + (Number(area.x || 0) + Number(area.w || 0)) * scale);
  const top = offsetY + Number(area.y || 0) * scale;
  const width = Math.max(32, Number(area.w || 0) * scale);
  const height = Math.max(42, Number(area.h || 0) * scale);
  const label = face.recognized ? face.customer?.name : 'Unknown';
  return (
    <button
      type="button"
      className={`face-box ${face.recognized ? 'recognized' : 'unknown'} ${selected ? 'selected' : ''}`}
      style={{ left, top, width, height }}
      onClick={() => face.recognized && onSelect(face)}
      title={face.recognized ? `Select ${label}` : 'Unknown person'}
    >
      <span className="face-corners"><i/><i/><i/><i/></span>
      <span className="face-label">
        <b>{label}</b>
        <small>{face.recognized ? money(face.customer?.balance > 0 ? face.customer.balance : 0) + (face.customer?.balance > 0 ? ' due' : '') : 'Not registered'}</small>
      </span>
    </button>
  );
}

export default function LiveMultiFaceScanner({ isOpen, onClose }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const streamRef = useRef(null);
  const scanBusyRef = useRef(false);
  const timerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [faces, setFaces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [txnOpen, setTxnOpen] = useState(false);
  const [txnType, setTxnType] = useState('DEBT');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [txnBusy, setTxnBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
    setFaces([]);
    setSelected(null);
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API is not supported by this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      setCameraError(error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access and try again.' : error.message || 'Unable to access the camera.');
    }
  }, []);

  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !ready || scanBusyRef.current) return;
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) return;
    scanBusyRef.current = true;
    setScanning(true);
    try {
      const canvas = document.createElement('canvas');
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
      if (!blob) return;
      const fd = new FormData();
      fd.append('file', blob, 'live-frame.jpg');
      const response = await api.post('/owner/face/scan', fd, { timeout: 30000 });
      const nextFaces = Array.isArray(response.data?.faces) ? response.data.faces : [];
      setFaces(nextFaces);
      setLastScan(new Date());
      setSelected((current) => {
        if (!current) return null;
        return nextFaces.find((f) => f.customer?.id === current.customer?.id) || null;
      });
    } catch (error) {
      if (error.response?.status === 503) setActionError(error.response?.data?.message || 'Face service is unavailable.');
    } finally {
      scanBusyRef.current = false;
      setScanning(false);
    }
  }, [ready]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return undefined;
    }
    startCamera();
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  useEffect(() => {
    if (!isOpen || !ready) return undefined;
    scanFrame();
    timerRef.current = setInterval(scanFrame, 1600);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isOpen, ready, scanFrame]);

  useEffect(() => {
    const update = () => {
      const video = videoRef.current;
      const stage = stageRef.current;
      if (video) setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      if (stage) setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    if (stageRef.current) observer.observe(stageRef.current);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [isOpen, ready]);

  const recognized = faces.filter((f) => f.recognized);
  const selectFace = (face) => { setSelected(face); setActionError(''); setTxnOpen(false); };

  const commitTransaction = async (e) => {
    e.preventDefault();
    if (!selected?.customer?.id || Number(amount) <= 0) return setActionError('Select a valid customer and enter an amount greater than zero.');
    setTxnBusy(true); setActionError('');
    try {
      await api.post('/owner/transactions', {
        customerId: selected.customer.id,
        type: txnType,
        amount: Number(amount),
        description: description.trim(),
      });
      setAmount(''); setDescription(''); setTxnOpen(false);
      await scanFrame();
    } catch (error) {
      setActionError(error.response?.data?.message || 'Transaction could not be recorded.');
    } finally { setTxnBusy(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="multiface-backdrop">
      <div className="multiface-modal">
        <header className="multiface-header">
          <div className="multiface-title">
            <div className="multiface-icon"><ScanFace/></div>
            <div><span className="eyebrow">LIVE CUSTOMER IDENTIFICATION</span><h2>Multi-face store scanner</h2><p>Keep the camera running while customers move through the shop.</p></div>
          </div>
          <div className="multiface-header-actions"><span className="live"><i/> LIVE</span><button className="icon-btn" onClick={() => { stopCamera(); onClose(); }}><X/></button></div>
        </header>

        <div className="multiface-body">
          <section className="multiface-camera panel">
            <div className="multiface-stage" ref={stageRef}>
              {cameraError ? <div className="multiface-error"><AlertCircle/><h3>Camera unavailable</h3><p>{cameraError}</p><button className="btn secondary" onClick={startCamera}><RefreshCw/> Try again</button></div> : <>
                <video ref={videoRef} muted autoPlay playsInline onLoadedMetadata={(e) => { setVideoSize({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight }); setReady(true); }}/>
                <div className="camera-grid"/>
                {faces.map((face) => <Box key={face.faceId} face={face} selected={selected?.faceId === face.faceId} onSelect={selectFace} videoSize={videoSize} stageSize={stageSize}/>) }
                {!faces.length && ready && <div className="scanner-hint"><ScanFace/><b>Scanning the room</b><span>Move customers into view. Multiple faces can be recognized at once.</span></div>}
                <div className="scanner-live-status"><span className={scanning ? 'pulse ready' : 'pulse'}/>{scanning ? 'ANALYZING FRAME' : 'MONITORING'} <b>{faces.length} face{faces.length === 1 ? '' : 's'}</b></div>
              </>}
            </div>
            <div className="multiface-camera-footer">
              <div className="scanner-stat"><strong>{faces.length}</strong><span>Faces in frame</span></div>
              <div className="scanner-stat recognized-stat"><strong>{recognized.length}</strong><span>Recognized</span></div>
              <div className="scanner-stat"><strong>{faces.length - recognized.length}</strong><span>Unknown</span></div>
              <div className="scanner-last">{lastScan ? `Last scan ${lastScan.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Waiting for first scan'}</div>
            </div>
          </section>

          <aside className="multiface-sidebar">
            <div className="panel detected-panel">
              <div className="panel-head"><div><span className="eyebrow"><UserRound/> DETECTED CUSTOMERS</span><h2>{recognized.length} recognized</h2></div><button className="icon-btn" onClick={scanFrame} disabled={scanning}><RefreshCw className={scanning ? 'spin' : ''}/></button></div>
              <div className="detected-list">
                {faces.length === 0 ? <div className="detected-empty"><ScanFace/><b>No customers recognized yet</b><span>The scanner will keep checking the live camera.</span></div> : faces.map((face) => face.recognized ? <button type="button" className={`detected-card ${selected?.faceId === face.faceId ? 'selected' : ''}`} key={face.faceId} onClick={() => selectFace(face)}><span className="detected-avatar">{face.customer?.name?.[0]?.toUpperCase() || '?'}</span><span><b>{face.customer?.name}</b><small>{face.customer?.phone}</small></span><strong className={face.customer?.balance > 0 ? 'due' : face.customer?.balance < 0 ? 'advance' : 'settled'}>{face.customer?.balance > 0 ? money(face.customer.balance) : face.customer?.balance < 0 ? `+${money(Math.abs(face.customer.balance))}` : '₹0'}<small>{face.customer?.balance > 0 ? 'Due' : face.customer?.balance < 0 ? 'Advance' : 'Settled'}</small></strong><ChevronRight/></button> : <div className="unknown-card" key={face.faceId}><span className="detected-avatar unknown-avatar">?</span><span><b>Unknown person</b><small>Not registered</small></span></div>)}
              </div>
            </div>

            {selected ? <div className="panel selected-customer-panel">
              <div className="selected-customer-head"><span className="selected-avatar">{selected.customer?.name?.[0]?.toUpperCase()}</span><div><span className="eyebrow">SELECTED ACCOUNT</span><h3>{selected.customer?.name}</h3><small>{selected.customer?.phone}{selected.customer?.email ? ` · ${selected.customer.email}` : ''}</small></div></div>
              <div className="selected-stats"><div><span>Balance</span><b className={selected.customer?.balance > 0 ? 'due' : selected.customer?.balance < 0 ? 'advance' : 'settled'}>{selected.customer?.balance > 0 ? money(selected.customer.balance) : selected.customer?.balance < 0 ? `+${money(Math.abs(selected.customer.balance))}` : '₹0'}</b></div><div><span>Debt</span><b>{money(selected.customer?.totalDebt)}</b></div><div><span>Payments</span><b>{money(selected.customer?.totalPayment)}</b></div></div>
              {actionError && <div className="scanner-action-error"><AlertCircle/>{actionError}</div>}
              {!txnOpen ? <div className="selected-actions"><button className="btn primary" onClick={() => { setTxnType('DEBT'); setTxnOpen(true); }}><ArrowUpRight/> Add debt</button><button className="btn payment-btn" onClick={() => { setTxnType('PAYMENT'); setTxnOpen(true); }}><ArrowDownLeft/> Payment</button><button className="btn secondary" onClick={() => navigate(`/owner/customers/${selected.customer.id}`)}><ExternalLink/> Profile</button></div> : <form className="scanner-transaction" onSubmit={commitTransaction}><div className="segmented"><button type="button" className={txnType === 'DEBT' ? 'on debt' : ''} onClick={() => setTxnType('DEBT')}><ArrowUpRight/> Debt</button><button type="button" className={txnType === 'PAYMENT' ? 'on payment' : ''} onClick={() => setTxnType('PAYMENT')}><ArrowDownLeft/> Payment</button></div><label>Amount (₹)<div className="input-wrap"><CircleDollarSign/><input autoFocus type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required/></div></label><label>Description <em>optional</em><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={txnType === 'DEBT' ? 'Groceries, milk, etc.' : 'Cash, UPI, GPay, etc.'}/></label><div className="scanner-form-actions"><button type="button" className="btn secondary" onClick={() => setTxnOpen(false)}>Cancel</button><button className={`btn ${txnType === 'DEBT' ? 'primary' : 'payment-btn'}`} disabled={txnBusy}>{txnBusy ? <><Loader2 className="spin"/> Saving...</> : <><Check/> Confirm</>}</button></div></form>}
              <div className="scanner-security"><ShieldCheck/> Recognition only identifies the account. Financial changes require owner confirmation.</div>
            </div> : <div className="panel scanner-selection-empty"><ScanFace/><h3>Select a recognized customer</h3><p>Click a customer card or a face box to inspect their account and record a transaction.</p></div>}
          </aside>
        </div>
        <footer className="multiface-footer"><span><Camera/> Camera stays active until you close the scanner.</span><button className="btn secondary" onClick={() => { stopCamera(); onClose(); }}>Close scanner</button></footer>
      </div>
    </div>
  );
}
