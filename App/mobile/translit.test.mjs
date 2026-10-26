// Run with: npm test   (uses Node's built-in test runner, no extra packages)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGeez, typeInto } from './translit.ts';

const WORDS = {
  selam: 'ሰላም',
  ena: 'እና',
  new: 'ነው',
  lay: 'ላይ',
  biet: 'ቤት',
  bunna: 'ቡና',
  mengst: 'መንግስት',
  amarNa: 'አማርኛ',
  ityoPya: 'ኢትዮጵያ',
  wsT: 'ውስጥ',
  gwadeNa: 'ጓደኛ',
  qwanqwa: 'ቋንቋ',
  shay: 'ሻይ',
  Tena: 'ጠና',
};

test('words convert to Ge\'ez', () => {
  for (const [latin, geez] of Object.entries(WORDS)) assert.equal(toGeez(latin), geez, latin);
});

test('all seven orders of s', () => {
  assert.equal(toGeez('se su si sa sie s so'), 'ሰ ሱ ሲ ሳ ሴ ስ ሶ');
});

test('typing letter by letter rewrites the current word', () => {
  let state = { text: '', buffer: '' };
  for (const ch of 'selam') state = typeInto(state.text, state.text + ch, state.buffer);
  assert.equal(state.text, 'ሰላም');
});

test('punctuation and existing Ge\'ez text are handled', () => {
  let state = { text: 'ሰላም', buffer: '' };
  for (const ch of ' new.') state = typeInto(state.text, state.text + ch, state.buffer);
  assert.equal(state.text, 'ሰላም ነው።');
});

test('backspace removes one Latin letter of the current word', () => {
  let state = { text: '', buffer: '' };
  for (const ch of 'sela') state = typeInto(state.text, state.text + ch, state.buffer);
  state = typeInto(state.text, state.text.slice(0, -1), state.buffer);
  assert.equal(state.text, 'ሰል');
});
