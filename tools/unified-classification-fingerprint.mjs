import crypto from 'node:crypto';

function actionIdentity(action) {
  if (!action) return null;
  return {
    id: action.id ?? null,
    seq: action.seq ?? null,
    ts: action.ts ?? null,
    text: action.text ?? action.name ?? null,
    incantation: action.profile?.incantation ?? null,
  };
}

function hitIdentity(hit) {
  return {
    id: hit.id ?? null,
    seq: hit.seq ?? null,
    ts: hit.ts ?? null,
    mob: hit.mob ?? null,
    dmg: hit.dmg ?? null,
    type: hit.type ?? null,
    virtual: hit.type === 'virtual' || hit.countsAsHit === false,
    virtualReason: hit.virtualReason ?? hit.reason ?? null,
  };
}

export function classificationFingerprintValue(turn) {
  return {
    ts: turn?.ts ?? null,
    status: turn?.status ?? null,
    reason: turn?.reason ?? null,
    components: (turn?.components || []).map(component => ({
      id: component.id ?? null,
      comp: component.comp ?? component.kind ?? null,
      actionLabel: component.actionLabel ?? null,
      action: actionIdentity(component.action),
      hits: (component.hits || []).map(hitIdentity),
    })),
  };
}

export function classificationFingerprint(turn) {
  const value = JSON.stringify(classificationFingerprintValue(turn));
  return crypto.createHash('sha256').update(value).digest('hex');
}
