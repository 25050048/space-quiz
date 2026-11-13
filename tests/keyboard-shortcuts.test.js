const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class Element {
  constructor(tagName = "DIV") {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.classNames = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classNames.add(name)),
      contains: name => this.classNames.has(name)
    };
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = value.includes("<span") ? [new Element("SPAN"), new Element("SPAN")] : [];
  }

  get innerHTML() { return this._innerHTML || ""; }
  get lastElementChild() { return this.children[this.children.length - 1]; }
  get firstElementChild() { return this.children[0]; }

  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = elements; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) {
    (this.listeners[name] ||= []).push(listener);
  }
  focus() {}
  click() {
    if (this.hidden || this.disabled) return;
    for (const listener of this.listeners.click || []) listener();
  }
}

function createQuiz() {
  const elements = Object.fromEntries(
    ["question-count", "score", "progress-fill", "prompt", "answers", "feedback", "next",
      "title", "theme-toggle", "theme-icon", "theme-label", "quiz-content"]
      .map(id => [id, new Element(id === "next" || id === "theme-toggle" ? "BUTTON" : "DIV")])
  );
  const progress = new Element();
  const themeColor = {};
  const documentListeners = {};
  const document = {
    documentElement: { dataset: {} },
    body: new Element("BODY"),
    getElementById: id => elements[id],
    querySelector: selector => selector === '[role="progressbar"]' ? progress : themeColor,
    createElement: tagName => new Element(tagName.toUpperCase()),
    addEventListener(name, listener) {
      (documentListeners[name] ||= []).push(listener);
    },
    dispatch(name, event) {
      for (const listener of documentListeners[name] || []) listener(event);
    }
  };
  const context = {
    document,
    window: { matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: () => null, setItem() {} },
    location: { reload() {} }
  };
  vm.runInNewContext(script, context);

  return {
    document,
    elements,
    dispatchKey(key, options = {}) {
      const event = {
        key,
        target: options.target || document.body,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        ...options,
        preventDefault() { this.defaultPrevented = true; }
      };
      document.dispatch("keydown", event);
      return event;
    }
  };
}

for (let choice = 1; choice <= 4; choice++) {
  test(`number key ${choice} selects its corresponding answer`, () => {
    const quiz = createQuiz();
    quiz.dispatchKey(String(choice));

    const selected = quiz.elements.answers.children[choice - 1];
    assert.equal(selected.disabled, true);
    assert.equal(selected.classList.contains("correct") || selected.classList.contains("incorrect"), true);
    assert.equal(quiz.elements.next.hidden, false);
  });
}

test("number keys cannot answer again after submission", () => {
  const quiz = createQuiz();
  quiz.dispatchKey("2");
  quiz.dispatchKey("1");

  assert.equal(quiz.elements.score.textContent, "1");
  assert.equal(quiz.elements["question-count"].textContent, "QUESTION 1 OF 10");
});

test("number keys ignore choices that are unavailable or hidden", () => {
  const quiz = createQuiz();
  quiz.elements.answers.children.pop();
  quiz.dispatchKey("4");
  assert.equal(quiz.elements.next.hidden, true);

  quiz.elements.answers.children[0].hidden = true;
  quiz.dispatchKey("1");
  assert.equal(quiz.elements.next.hidden, true);
});

test("Enter advances only after submission and advances once", () => {
  const quiz = createQuiz();
  quiz.dispatchKey("Enter");
  assert.equal(quiz.elements["question-count"].textContent, "QUESTION 1 OF 10");

  quiz.dispatchKey("1");
  const event = quiz.dispatchKey("Enter");
  assert.equal(event.defaultPrevented, true);
  assert.equal(quiz.elements["question-count"].textContent, "QUESTION 2 OF 10");

  quiz.dispatchKey("Enter");
  assert.equal(quiz.elements["question-count"].textContent, "QUESTION 2 OF 10");
});

test("shortcuts ignore modified keys, editable controls, and other buttons", () => {
  const quiz = createQuiz();
  quiz.dispatchKey("1", { ctrlKey: true });
  quiz.dispatchKey("1", { target: { tagName: "INPUT" } });
  assert.equal(quiz.elements.next.hidden, true);

  quiz.dispatchKey("1");
  quiz.dispatchKey("Enter", { target: quiz.elements["theme-toggle"] });
  assert.equal(quiz.elements["question-count"].textContent, "QUESTION 1 OF 10");
});
