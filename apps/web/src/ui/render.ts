// Screen dispatcher. Re-renders everything on each change and restores focus to inputs marked data-keep.
import type { UI } from '../main.ts';
import { home, library, savesScreen, setup } from './menus.ts';
import { decks, gallery } from './decks.ts';
import { cardFace, h, noteEl } from './kit.ts';
import { table } from './table.ts';
import { campaignScreen, encounterScreen, rewardScreen, shopScreen } from './campaign.ts';

const SCREENS = { library, home, setup, saves: savesScreen, decks, gallery, game: table, campaign: campaignScreen, encounter: encounterScreen, reward: rewardScreen, shop: shopScreen };

export function render(ui: UI, A: any) {
  document.documentElement.dataset.theme = ui.theme;
  const app = document.getElementById('app')!;
  const active = document.activeElement as HTMLInputElement | null;
  const keep = active?.dataset?.keep;
  const caret = keep ? active!.selectionStart : null;
  const screen = ui.screen !== 'library' && !ui.mod ? 'library' : ui.screen;
  const view = SCREENS[screen](ui, A);
  const peek = ui.peek && ui.mod?.card.has(ui.peek)
    ? h('div', { class: 'peek', role: 'dialog', 'aria-label': 'Card preview', onclick: A.closePeek },
      cardFace(ui.mod, ui.peek, { size: 'lg', onclick: A.closePeek }), h('div', { class: 'peek-hint' }, 'Tap anywhere to close'))
    : null;
  app.replaceChildren(view, ...(ui.note && screen !== 'game' ? [noteEl(ui.note, A.closeNote)] : []), ...(peek ? [peek] : []));
  if (keep) {
    const el = app.querySelector<HTMLInputElement>(`[data-keep="${keep}"]`);
    el?.focus();
    if (el && caret !== null) el.setSelectionRange(caret, caret);
  }
}
