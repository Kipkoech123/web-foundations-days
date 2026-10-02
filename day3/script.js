let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// 1. searchNotes: the sieve. Keeps only notes that contain the word.
function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter(function (note) {
    return note.text.toLowerCase().includes(search);
  });
}

// 2. longestNote: find the champion. Check for an empty cabinet first.
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// 3. countByCategory: a tally sheet. One counter per category.
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category] = counts[note.category] + 1;
  }
  return counts;
}

// 4. getSummary: turns the tally into a sentence.
function getSummary() {
  const total = notes.length;
  if (total === 0) {
    return "0 notes.";
  }
  const word = total === 1 ? "note" : "notes";
  const counts = countByCategory();
  const order = ["personal", "work", "study"];
  const parts = [];
  for (const category of order) {
    if (counts[category] > 0) {
      parts.push(`${counts[category]} ${category}`);
    }
  }
  return `${total} ${word}: ${parts.join(", ")}.`;
}

// 5. isDuplicate: "does anyone in the room already match?"
function normalize(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function isDuplicate(text) {
  const cleaned = normalize(text);
  return notes.some(function (note) {
    return normalize(note.text) === cleaned;
  });
}

// 6. addNote: the bouncer. Three checks before a note gets in.
function addNote(text, category) {
  const cleaned = text.trim();
  const allowed = ["personal", "work", "study"];

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Not added: text must be 1 to 200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("Not added: this note already exists.");
    return false;
  }
  if (!allowed.includes(category)) {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }

  const newId = notes.length === 0 ? 1 : notes[notes.length - 1].id + 1;
  notes.push({ id: newId, text: cleaned, category: category });
  return true;
}

// ---------------- TESTS ----------------

// searchNotes
console.log(searchNotes("the"));
// Expected: 2 notes (id 2 "Finish the Day 3 assignment", id 3 "Email the project report to Grace")
console.log(searchNotes("zebra"));
// Expected: [] (no results)
console.log(searchNotes("MILK"));
// Expected: 1 note (id 1), proves upper/lower case is ignored

// longestNote
console.log(longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }
const savedNotes = notes;
notes = [];
console.log(longestNote());
// Expected: null (empty array)
notes = savedNotes;

// countByCategory
console.log(countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }
notes = [];
console.log(countByCategory());
// Expected: {} (empty object)
notes = savedNotes;

// getSummary
console.log(getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."
notes = [{ id: 1, text: "Only one", category: "work" }];
console.log(getSummary());
// Expected: "1 note: 1 work."
notes = savedNotes;

// isDuplicate
console.log(isDuplicate("  call   MUM "));
// Expected: true (ignores case and extra spaces)
console.log(isDuplicate("Walk the dog"));
// Expected: false

// addNote
console.log(addNote("Walk the dog", "personal"));
// Expected: true
console.log(addNote("walk the dog", "personal"));
// Expected: false, logs "Not added: this note already exists."
console.log(addNote("", "work"));
// Expected: false, logs "Not added: text must be 1 to 200 characters."
console.log(addNote("Plan the week", "hobby"));
// Expected: false, logs "Not added: category must be personal, work or study."
console.log(getSummary());
// Expected: "6 notes: 3 personal, 1 work, 2 study."
