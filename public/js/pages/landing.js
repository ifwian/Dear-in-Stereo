import { initShell } from '../shell.js';
import { renderLetter } from '../render.js';
import { $ } from '../ui.js';

initShell();

// A sample reveal, built from the same renderer the real letters use. Nothing is saved.
const sample = {
  title: 'For the long drive home', recipient_name: 'Sam', theme: 'paper', reason_category: 'reminded_me',
  song_title: 'Dreams', artist: 'Fleetwood Mac', sender_name: 'Mara',
  message: 'I heard this in the kitchen this morning and thought of you straight away.\n\nPlay it on the way home. Turn it up for the second verse. I will be waiting at the other end.',
};
const button = $('#open-sample');
button.addEventListener('click', () => {
  const slot = $('#sample-slot');
  const open = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? 'Fold it back up' : 'Open the letter';
  $('#envelope').hidden = false;
  if (open) {
    const letter = renderLetter(sample, { withPlayer: false });
    letter.classList.add('reveal__letter');
    slot.replaceChildren(letter);
    $('#envelope').hidden = true;
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'btn btn--small'; close.textContent = 'Fold it back up';
    close.addEventListener('click', () => { slot.replaceChildren(); $('#envelope').hidden = false; button.setAttribute('aria-expanded', 'false'); button.textContent = 'Open the letter'; button.focus(); });
    slot.append(close);
    letter.setAttribute('tabindex', '-1');
    letter.focus({ preventScroll: true });
  }
});
