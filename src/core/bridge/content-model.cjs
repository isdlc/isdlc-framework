/**
 * CJS Bridge for content classification modules
 *
 * Allows CJS consumers (hooks, legacy scripts) to use the ESM
 * content model via dynamic import(). All functions return Promises.
 *
 * Requirements: REQ-0099 through REQ-0102
 * Per ADR-CODEX-006: Core in ESM with CJS bridge.
 */

let _contentModel;
let _agentClassification;
let _skillClassification;
let _commandClassification;
let _topicClassification;

async function loadContentModel() {
  if (!_contentModel) _contentModel = await import('../content/content-model.js');
  return _contentModel;
}

async function loadAgent() {
  if (!_agentClassification) _agentClassification = await import('../content/agent-classification.js');
  return _agentClassification;
}

async function loadSkill() {
  if (!_skillClassification) _skillClassification = await import('../content/skill-classification.js');
  return _skillClassification;
}

async function loadCommand() {
  if (!_commandClassification) _commandClassification = await import('../content/command-classification.js');
  return _commandClassification;
}

async function loadTopic() {
  if (!_topicClassification) _topicClassification = await import('../content/topic-classification.js');
  return _topicClassification;
}

module.exports = {
  async CLASSIFICATION_TYPES() {
    const m = await loadContentModel();
    return m.CLASSIFICATION_TYPES;
  },
  async PORTABILITY() {
    const m = await loadContentModel();
    return m.PORTABILITY;
  },
  async createSectionEntry(name, type, portability) {
    const m = await loadContentModel();
    return m.createSectionEntry(name, type, portability);
  },
  async getAgentClassification(name) {
    const m = await loadAgent();
    return m.getAgentClassification(name);
  },
  async listClassifiedAgents() {
    const m = await loadAgent();
    return m.listClassifiedAgents();
  },
  async getAgentPortabilitySummary() {
    const m = await loadAgent();
    return m.getAgentPortabilitySummary();
  },
  async getSkillSectionTemplate() {
    const m = await loadSkill();
    return m.getSkillSectionTemplate();
  },
  async getSkillClassification(skillId) {
    const m = await loadSkill();
    return m.getSkillClassification(skillId);
  },
  async getCategoryPortability(category) {
    const m = await loadSkill();
    return m.getCategoryPortability(category);
  },
  async listCategories() {
    const m = await loadSkill();
    return m.listCategories();
  },
  async getCommandClassification(name) {
    const m = await loadCommand();
    return m.getCommandClassification(name);
  },
  async listClassifiedCommands() {
    const m = await loadCommand();
    return m.listClassifiedCommands();
  },
  async getTopicClassification(topicId) {
    const m = await loadTopic();
    return m.getTopicClassification(topicId);
  },
  async listClassifiedTopics() {
    const m = await loadTopic();
    return m.listClassifiedTopics();
  },
  async getTopicPortabilitySummary() {
    const m = await loadTopic();
    return m.getTopicPortabilitySummary();
  }
};
