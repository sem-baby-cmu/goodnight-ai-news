# Prompt Engineering Discoveries — Playmate Component
**Owner:** Madhuri Dusad  
**Date:** November 2026  
**Purpose:** Document what was learned iterating prompts v1→v4 for each AI feature (hypothesis P1–P4)

---

## Feature 1 — True or False Zapper (P1)

**v1 → v2: Reading level matters immediately**  
The first prompt produced grammatically correct statements but used words like "neural network," "parameters," and "iterative training" that a 10-year-old cannot parse. Adding the constraint "Grade 4 reading level (simple sentences, common words)" fixed this across all 10 stories with no other changes needed.

**v2 → v3: Without a source constraint, the LLM adds facts**  
When only given a grade-level constraint, the model occasionally introduced plausible but unstated facts — for example, adding "GPT-5 scored 95% on the SAT" when the story only mentioned "scores higher on tests." Adding "Use only the key facts listed below. Do not add facts not listed" eliminated all hallucinated additions.

**v3 → v4: Prompt must specify exactly one FALSE statement**  
Without this rule, the model sometimes generated all-true quizzes or two false statements. Neither is useful: an all-true quiz has no wrong-answer learning moment; two false statements confuse kids about what to trust. Specifying "Exactly one statement must be FALSE" and asking for JSON with a `source_fact` field made outputs consistent and auditable across all 10 stories.

---

## Feature 2 — Story Scene Tap (P2)

**v1 → v2: "Elements" is too abstract for ages 5–7 design**  
The first prompt asked for "3 elements a child could tap." The model returned a mix of concrete objects and abstract concepts (e.g., "curiosity," "the idea of learning"). For a tap game aimed at 5-year-olds, every tappable item must be something visible and nameable. Specifying "concrete, visible objects — one to three words each" eliminated abstract responses entirely.

**v2 → v3: Fun facts need a readability constraint too**  
The second version produced good object lists but the fun facts were still written at a 3rd–4th grade level, with sentences like "Radar uses electromagnetic waves to detect objects." Restricting to "one sentence, simple words" and enforcing JSON output with an explicit `fun_fact` field brought responses to kindergarten level while keeping them accurate.

**Discovery: Scene description quality drives output quality**  
The clearest finding across P2 was that the prompt's scene description is the binding constraint — if the scene is vague, the model invents elements not visible in the illustration. Detailed scene descriptions like "Pip holding an umbrella while clouds and sun swirl above" produced grounded, consistent elements every time. This is a dependency to pass back to the Storyteller component: scene descriptions must be concrete and visual.

---

## Feature 3 — Word Flip Card (P3)

**v1 → v2: Giving just the word produces a dictionary definition**  
The first prompt ("Pick one important AI word and define it") returned definitions like "Chain-of-thought reasoning is a prompting technique that elicits multi-step reasoning." Accurate but useless for a 5-year-old. Moving to a structured card format (front/back) with an explicit age audience constraint produced simpler definitions immediately.

**v2 → v3: Adding an example sentence and illustration prompt increases pedagogical value**  
The second version had good definitions but no context for how the word is used in real life. Children learn vocabulary better with examples than definitions alone (supported by the same research behind Khanmigo's design). Adding `example` and `illustration_prompt` fields to the JSON schema produced outputs that are directly usable in the UI with no post-processing, and the illustration prompts were consistently kid-safe and watercolor-style as specified.

---

## Feature 4 — Ask the AI Safety (P4)

**v1 → v2: Without a scope constraint, the AI answers everything**  
The first prompt had no restriction on what the AI could answer. When tested with "How does the internet work?", it gave a full accurate explanation unrelated to the story. For a bedtime app, every answer must come from tonight's story only — otherwise the feature becomes an unrestricted web search for children.

**v2 → v3: The deflection phrase must be exact and specified in the prompt**  
The second version said "redirect off-topic questions" but the model paraphrased differently each time — "That's not from our story tonight!", "I can only talk about Pip's adventure!", etc. This made automated safety testing impossible. Specifying the exact deflection string "Let us talk about tonight's story!" in the prompt produced 100% consistent deflection across all 30 unsafe test questions (hacking, private contact info, cheating requests) with no false positives on on-topic questions.

**Discovery: Story-scoping does not reduce answer quality for on-topic questions**  
A concern before testing was that restricting the AI to story content only would make answers feel thin. In practice, the story summaries contained enough detail that on-topic answers ("What did Pip learn tonight?", "How does the AI work?") were complete, age-appropriate, and accurate — with no child ever needing outside information to understand the night's story.

---

## Cross-Story Findings (Multi-dataset)

Running all four features across 10 stories covering different AI topics (medical, transportation, art, security, weather, language, education, music, agriculture) revealed:

| Finding | Evidence |
|---------|----------|
| 5to7 stories need shorter key facts | Facts like "It can predict a week of weather in under one minute" worked well; compound facts caused run-on quiz statements |
| 8to10 stories can handle one technical term per statement | "Waymo self-driving cars use cameras and radar" parsed fine at grade 4–5 level |
| Abstract AI words (Anomaly detection, Chain-of-thought) need more careful definition framing than concrete words (Agricultural robot, AI tutor) | Concrete words needed only 1 revision cycle; abstract words needed 2 |
| Safety deflection rate was identical (100%) regardless of story topic | The safety behavior is topic-independent — the deflection logic works as a universal guard |
