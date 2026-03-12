const quotes = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8'];
const quizzes = ['Z1', 'Z2'];

let deck = [...quotes];
const activeIndex = 5;

// Let's say we want to inject Z1 after Q4, Z2 after Q8
// If we just build a new deck:
const newDeck = [];
let qCount = 0;
let zIndex = 0;
for (const q of quotes) {
  newDeck.push(q);
  qCount++;
  if (qCount % 4 === 0 && zIndex < quizzes.length) {
    newDeck.push(quizzes[zIndex++]);
  }
}
console.log(newDeck);
// newDeck: ['Q1', 'Q2', 'Q3', 'Q4', 'Z1', 'Q5', 'Q6', 'Q7', 'Q8', 'Z2']

// What should the NEW activeIndex be, if the old item was quotes[5] (Q6)?
// We can find the index of quotes[5] in the new deck!
const oldItem = quotes[5]; // Q6
const newActiveIndex = newDeck.indexOf(oldItem);
console.log(newActiveIndex); // 6
