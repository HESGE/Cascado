const validWheel = value => Number.isInteger(value) && value >= 1 && value <= 5;

/** Rule markers depend only on public turn state in the displayed projection.
 * Selection alone never changes the restriction inherited by the next turn. */
export function wheelRestriction(view) {
  const upcomingWheel = validWheel(view?.engaged) ? view.engaged : null;
  const blockedWheel = !view?.engaged && validWheel(view?.lastWheel)
    && Array.isArray(view?.allowedWheels) && !view.allowedWheels.includes(view.lastWheel)
    ? view.lastWheel : null;
  return { blockedWheel, upcomingWheel };
}

/** Never inspect a face's tokens to predict the other player's wheel-5 exception. */
export function wheelRestrictionMessage(view, { watchingOpponent = false } = {}) {
  const { blockedWheel, upcomingWheel } = wheelRestriction(view);
  if (upcomingWheel !== null) {
    const text = upcomingWheel === 5
      ? watchingOpponent
        ? 'Ton prochain tour : roue 5 interdite, sauf dernier jeton'
        : 'Adversaire : roue 5 interdite, sauf dernier jeton'
      : watchingOpponent
        ? `Ton prochain tour : roue ${upcomingWheel} interdite`
        : `Prochain tour : roue ${upcomingWheel} interdite à l’adversaire`;
    return { kind: 'upcoming', wheel: upcomingWheel, text };
  }
  if (blockedWheel !== null) {
    return {
      kind: 'blocked', wheel: blockedWheel,
      text: watchingOpponent
        ? `Roue ${blockedWheel} interdite à l’IA ce tour`
        : `Roue ${blockedWheel} interdite ce tour`,
    };
  }
  return { kind: 'none', wheel: null, text: '' };
}
