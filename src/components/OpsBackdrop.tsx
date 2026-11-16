export function OpsBackdrop() {
  return (
    <div className="ops-backdrop" aria-hidden>
      <div className="ops-grid" />
      <div className="ops-scanline" />
      <div className="ops-vignette" />
      <div className="ops-orb ops-orb-a" />
      <div className="ops-orb ops-orb-b" />
      <svg className="ops-packets" viewBox="0 0 1200 800" preserveAspectRatio="none">
        <path className="ops-packet-path" d="M40 620 C 220 480, 360 720, 560 420 S 900 180, 1160 260" />
        <path className="ops-packet-path ops-packet-delay" d="M80 140 C 280 260, 420 80, 640 300 S 980 520, 1140 640" />
        <path className="ops-packet-path ops-packet-delay-2" d="M20 400 C 260 360, 480 520, 700 280 S 980 240, 1180 480" />
      </svg>
    </div>
  );
}
