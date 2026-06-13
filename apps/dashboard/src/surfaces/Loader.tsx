// A loading ring (from Liz's CSS) — shown while an extraction runs. Contained (not fixed to the
// viewport), scoped class names, with the orbiting dot + rotating arc. Yellow per the reference.
export function Loader({ label, size = 72 }: { label?: string; size?: number }) {
  return (
    <div className="sde-ring" style={{ width: size, height: size, lineHeight: `${size}px` }}>
      {label}
      <span className="sde-dot" />
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.sde-ring {
  position: relative;
  border: 3px solid #3c3c3c;
  border-radius: 50%;
  text-align: center;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #fff000;
  text-shadow: 0 0 10px #fff000;
}
.sde-ring::before {
  content: '';
  position: absolute;
  top: -3px; left: -3px;
  width: 100%; height: 100%;
  border: 3px solid transparent;
  border-top: 3px solid #fff000;
  border-right: 3px solid #fff000;
  border-radius: 50%;
  animation: sde-ringC 2s linear infinite;
}
.sde-dot {
  position: absolute;
  top: calc(50% - 2px); left: 50%;
  width: 50%; height: 4px;
  transform-origin: left;
  animation: sde-ringD 2s linear infinite;
}
.sde-dot::before {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff000;
  top: -6px; right: -7px;
  box-shadow: 0 0 20px #fff000;
}
@keyframes sde-ringC { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes sde-ringD { 0% { transform: rotate(45deg); } 100% { transform: rotate(405deg); } }
@media (prefers-reduced-motion: reduce) {
  .sde-ring::before, .sde-dot { animation: none; }
}
`;
