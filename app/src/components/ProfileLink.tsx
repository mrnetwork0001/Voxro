/** The inbox's shareable bio link (voxro.shieldsuite.xyz/#/@handle) with a Copy button. */
import { useState } from 'react';
import { useI18n } from '../i18n.tsx';
import { profileLink } from '../router.ts';

export function ProfileLink({ handle }: { handle: string }) {
  const { lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = profileLink(handle);
  return (
    <div className="wiz-share mt-s" title={lang === 'zh' ? '放到你的简介中' : 'Put this in your bio'}>
      <span className="mono small">{url}</span>
      <button
        type="button"
        className="btn sm"
        onClick={() =>
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? (lang === 'zh' ? '已复制' : 'Copied') : lang === 'zh' ? '复制链接' : 'Copy link'}
      </button>
    </div>
  );
}
