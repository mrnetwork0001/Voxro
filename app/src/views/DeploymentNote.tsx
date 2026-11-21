import { Note } from '../components/ui.tsx';
import { DEPLOYED } from '../config.ts';
import { useI18n } from '../i18n.tsx';

/** Live-on-mainnet banner, or — before the contracts exist — an honest "not deployed" notice (no simulation). */
export function DeploymentNote() {
  const { t } = useI18n();
  return DEPLOYED ? <Note tone="ok">{t('chain.liveNote')}</Note> : <Note tone="warn">{t('c.notDeployed')}</Note>;
}
