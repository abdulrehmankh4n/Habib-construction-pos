import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Camera } from 'lucide-react';
import { Modal, Select } from './ui';

export function ScannerModal({ open, onClose, onDetected }: { open: boolean; onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const detectedRef = useRef(onDetected);
  detectedRef.current = onDetected;

  const supported = typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!open || !supported) return;
    BrowserMultiFormatReader.listVideoInputDevices()
      .then((list) => {
        setDevices(list);
        const back = list.find((d) => /back|rear|environment/i.test(d.label));
        setDeviceId((current) => current ?? back?.deviceId ?? list[0]?.deviceId);
      })
      .catch(() => setError('Could not list cameras. Allow camera access in the browser.'));
  }, [open, supported]);

  useEffect(() => {
    if (!open || !supported || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    setError(null);
    reader
      .decodeFromVideoDevice(deviceId, videoRef.current, (result) => {
        if (!result || cancelled) return;
        const code = result.getText().trim();
        const now = Date.now();
        if (code === lastRef.current.code && now - lastRef.current.at < 2000) return;
        lastRef.current = { code, at: now };
        setLast(code);
        detectedRef.current(code);
      })
      .then((controls) => {
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      })
      .catch((e: Error) => setError(e.name === 'NotAllowedError' ? 'Camera permission was denied.' : `Camera error: ${e.message}`));
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, supported, deviceId]);

  return (
    <Modal open={open} onClose={onClose} title="Scan barcode / QR code" size="md">
      {!supported ? (
        <div className="space-y-2 text-sm text-slate-700">
          <p className="font-medium">Camera scanning needs a secure connection.</p>
          <p>
            Browsers only allow camera access on <code>https://</code> or on the server computer itself (<code>http://localhost</code>). Use a
            USB/Bluetooth barcode scanner (works everywhere — just scan into the search box), or enable HTTPS on the server (see README → HTTPS).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.length > 1 && (
            <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="Camera">
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </Select>
          )}
          <div className="relative overflow-hidden rounded-lg bg-slate-900">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />
          </div>
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Camera className="h-4 w-4" /> Point the camera at the product barcode or QR label. Items are added automatically.
            </p>
          )}
          {last && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Last scanned: <span className="font-mono">{last}</span>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
