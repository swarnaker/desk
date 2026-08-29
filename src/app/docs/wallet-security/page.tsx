export default function WalletSecurityPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 border border-hairline bg-surface p-6 text-[13px] leading-relaxed text-ink">
      <h1 className="text-sm tracking-[0.2em] text-gold">WALLET SECURITY</h1>
      <p className="text-mute">drawdown rules → docs/wallet-security</p>
      <section>
        <h2 className="mb-1 text-[11px] tracking-[0.16em] text-gold">SIGNAL ONLY</h2>
        <p>LINE is signal only. LINE never holds keys and never swaps. Paste CA in the header to open a token. There is no Connect, Sign, Approve, or Swap chrome on this site.</p>
      </section>
      <section>
        <h2 className="mb-1 text-[11px] tracking-[0.16em] text-gold">VERIFY THE CA</h2>
        <p>Always compare the contract address on LINE with GMGN, DexScreener, and the chain explorer before you size a trade in your own wallet. Same-name ticker copies are hidden unless you watch them. If the desk is empty, the CA did not resolve — do not invent a token to trade.</p>
      </section>
      <section>
        <h2 className="mb-1 text-[11px] tracking-[0.16em] text-gold">DRAWDOWN</h2>
        <p>No thin-LP apes. Treat AMBER as the default. Hide risky removes RED plus honeypot / mint-auth / freeze / extremely thin LP. AMBER stays on the board so you can see it without pretending it is safe.</p>
      </section>
      <section>
        <h2 className="mb-1 text-[11px] tracking-[0.16em] text-gold">WHAT LINE NEVER DOES</h2>
        <ul className="list-disc space-y-1 pl-5 text-mute">
          <li>LINE never asks you to sign.</li>
          <li>LINE never shows a seed or wallet popup.</li>
          <li>LINE never holds keys, seeds, or session signers.</li>
          <li>LINE never fabricates DEV%, sniper%, bundle%, or honeypot results. Unknown stats render as an em dash.</li>
        </ul>
      </section>
      <section>
        <h2 className="mb-1 text-[11px] tracking-[0.16em] text-gold">STAGE IS INFERRED</h2>
        <p>Stage is inferred from pair age and liquidity/mcap — not an official pad graduation. Official graduation is only claimed when a factory emits PoolGraduated, Pump has migrated, or an o1 pool is live. Pons V2 graduated pools are detected by the meme hook, never by PoolManager.</p>
      </section>
    </article>
  );
}
