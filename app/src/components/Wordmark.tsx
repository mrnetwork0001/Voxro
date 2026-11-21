import mark from '../assets/shieldsuite-mark.png';

/** Product lockup: the ShieldSuite studio mark + Voxro. Returns to the landing page. */
export function Wordmark() {
  return (
    <a className="wordmark" href="#/" title="Voxro · a ShieldSuite product">
      <img className="mark" src={mark} alt="" width={32} height={32} />
      <span>
        <span className="name">Voxro</span>
        <span className="by">by ShieldSuite</span>
      </span>
    </a>
  );
}
