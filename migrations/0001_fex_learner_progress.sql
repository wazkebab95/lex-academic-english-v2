CREATE TABLE IF NOT EXISTS learners (
  learner_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS course_enrolments (
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','paused','completed')),
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (learner_id, course_id)
);

CREATE TABLE IF NOT EXISTS module_progress (
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not_started','in_progress','completed')),
  choices_json TEXT NOT NULL DEFAULT '[]',
  correct_answers INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (learner_id, course_id, module_id)
);

CREATE TABLE IF NOT EXISTS vocabulary_items (
  course_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  example TEXT NOT NULL,
  PRIMARY KEY (course_id, item_id)
);

CREATE TABLE IF NOT EXISTS vocabulary_reviews (
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  repetitions INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  due_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_reviewed_at TEXT,
  last_rating TEXT,
  PRIMARY KEY (learner_id, course_id, item_id),
  FOREIGN KEY (course_id, item_id) REFERENCES vocabulary_items(course_id, item_id)
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  attempt_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS teacher_feedback (
  feedback_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(learner_id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  teacher_email TEXT NOT NULL,
  feedback TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_module_progress_learner ON module_progress(learner_id, course_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_due ON vocabulary_reviews(learner_id, course_id, due_at);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_learner ON assessment_attempts(learner_id, course_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_feedback_learner ON teacher_feedback(learner_id, course_id, created_at DESC);

INSERT OR IGNORE INTO vocabulary_items (course_id,item_id,term,definition,example) VALUES
('retail-business-english','sell-through-rate','Sell-through rate','The proportion of received or available stock that is sold during a defined period.','The campaign achieved an 80% sell-through rate.'),
('retail-business-english','stockout','Stockout','A situation in which an item is unavailable because no saleable stock remains.','The promotion caused a stockout in two popular sizes.'),
('retail-business-english','markdown','Markdown','A reduction in the selling price of a product.','The retailer introduced a markdown to clear seasonal stock.'),
('retail-business-english','shrinkage','Shrinkage','The difference between recorded inventory and the stock physically available.','The store investigated the inventory shrinkage.'),
('retail-business-english','replenishment','Replenishment','The process of replacing stock that has been sold or depleted.','The system triggered replenishment after the stock level fell.'),
('retail-business-english','sku','SKU (stock-keeping unit)','A code used to identify a distinct product or product variant.','Each colour and size has its own SKU.'),
('retail-business-english','lead-time','Lead time','The period between placing an order and receiving the goods.','The supplier confirmed a lead time of five working days.'),
('retail-business-english','footfall','Footfall','The number of people entering a physical retail location during a period.','Weekend footfall increased by 12%.'),
('retail-business-english','purchase-order','Purchase order','A formal document confirming the products, quantities and terms requested from a supplier.','The buyer amended the purchase order to include the extra units.'),
('retail-business-english','allocation','Allocation','The process of distributing stock across stores, channels or locations.','The allocation team prioritised stores with the lowest stock cover.'),
('retail-business-english','gross-margin','Gross margin','The difference between sales revenue and the cost of goods sold, expressed as a percentage of revenue.','The buying team monitored gross margin during the promotion.'),
('retail-business-english','stock-cover','Stock cover','The length of time current inventory is expected to meet demand.','The store had three weeks of stock cover remaining.');
