import {foodPortions} from './food-storage.js';
import {profileFor} from './resident-personality.js';

const PHYSICAL = ['hunger', 'bladder', 'bowels', 'hygiene'];
const TOPICS = {
  growing: 'growing food', food: 'food and cooking', nature: 'the land around them',
  making: 'making and repairing things', books: 'books', home: 'making a home',
  stories: 'stories from before the village', community: 'life together', learning: 'something they have learned',
};

export function ensureMind(r) {
  return r.mind ??= {memories: [], quietUntil: 0};
}

function remember(s, r, kind, text, other) {
  const mind = ensureMind(r);
  mind.memories.unshift({kind, text, time: s.time, ...(other ? {other: other.id} : {})});
  mind.memories.length = Math.min(6, mind.memories.length);
}

export function committed(r) {
  return r.job != null || r.operation != null || r.linkJob != null || !!r.cargo;
}

export function wantsConversation(s, r, initiator) {
  if (r === initiator || r.needTask || r.tentPhase || r.sleepUntil || r.action === 'rest' ||
      r.action === 'town' || r.outsideWork || r.cargo || r.energy < 35 ||
      (r.mind?.quietUntil || 0) > s.time || PHYSICAL.some(k => r.needs?.[k] < 30)) return false;
  const operation=s.operations?.find(o=>o.id===r.operation && !o.done);
  if(operation && ['return','deliver'].includes(operation.phase))return false;
  // Someone already busy only takes a social break if they need one too.
  if (committed(r)) return r.needs.social < 35;
  const limit = profileFor(r).temperament.acceptsAt + ((r.friendships?.[initiator.id] || 0) >= 64 ? 10 : 0);
  return r.needs.social < limit || (initiator.needs.social < 15 && r.energy >= 45);
}

export function conversationPartners(s, r) {
  const interests = profileFor(r).interests;
  const score = other => {
    const shared = profileFor(other).interests.filter(topic => interests.includes(topic)).length;
    return (100 - other.needs.social) / 10 + (r.friendships?.[other.id] || 0) / 20 + shared * 2
      - Math.hypot(other.x - r.x, other.z - r.z) / 3;
  };
  return s.people.filter(p => wantsConversation(s, p, r)).sort((a, b) => score(b) - score(a));
}

export function concern(s, r) {
  if (r.energy < 35) return 'I need to rest before I take on anything else.';
  if (r.needs?.hunger < 30) return 'It is hard to think about much until I have eaten.';
  if (Math.min(r.needs?.bladder ?? 100, r.needs?.bowels ?? 100) < 30) return 'I need a toilet break first.';
  return sharedConcern(s, r);
}
// What a friend would say to the others: about the village and how they are, not a passing bodily need.
export function sharedConcern(s, r) {
  if (r.energy < 35) return 'I am worn out. I need the pace to ease for a while.';
  if (r.id === 'iara' && foodPortions(s) < s.people.length)
    return 'The pantry is getting low. I want us to have enough to share.';
  if (r.id === 'caua' && s.infrastructure?.thirst) return 'We need reliable drinking water. I want to help sort it out.';
  if (r.id === 'nina' && r.needs?.hygiene < 40) return 'I would feel better after washing up.';
  if (r.needs?.social < 35) return r.id === 'luz' ? 'I miss sitting down with someone without rushing.' : 'I would like a little company.';
  if (r.needs?.fun < profileFor(r).temperament.breakAt) return 'I need a little time for something I enjoy.';
  return null;
}

export function conversationFor(s, a, b) {
  const worried = [a, b].find(r => concern(s, r));
  if (worried) return {kind: 'support', topic: 'how things are going', worried: worried.id, reason: concern(s, worried)};
  const shared = profileFor(a).interests.filter(topic => profileFor(b).interests.includes(topic));
  if (shared.length) {
    const count = (a.mind?.memories || []).filter(m => m.kind === 'conversation').length;
    return {kind: 'interest', topic: TOPICS[shared[count % shared.length]]};
  }
  return {kind: 'catch-up', topic: 'life in the village'};
}

export function finishConversation(s, a, b, conversation) {
  const exchange = conversation || conversationFor(s, a, b);
  for (const [r, other] of [[a, b], [b, a]]) {
    r.friendships ??= {};
    // A common interest and being listened to are meaningful in different ways.
    const gain = exchange.kind === 'interest' ? 7 : exchange.kind === 'support' && exchange.worried === r.id ? 8 : 4;
    r.friendships[other.id] = Math.min(100, (r.friendships[other.id] || 0) + gain);
    const text = exchange.kind === 'support'
      ? exchange.worried === r.id ? `${other.name} listened when I said, “${exchange.reason || 'I could use some company.'}”` : `I listened to ${other.name} talk about how things are going.`
      : `I enjoyed talking with ${other.name} about ${exchange.topic}.`;
    remember(s, r, 'conversation', text, other);
    // More reserved residents need a longer interval before another invitation.
    ensureMind(r).quietUntil = s.time + (100 - profileFor(r).temperament.acceptsAt);
    r.needHistory ??= {};
    r.needHistory.social = (r.needHistory.social || 0) + 1;
  }
}

// A day the whole village shared: a mutirão, a festa, a course taught.
export function rememberShared(s, r, text) {
  remember(s, r, 'milestone', text);
}

export function finishPersonalTime(s, r, label) {
  remember(s, r, 'personal', `${label}. ${profileFor(r).reflection}`);
  ensureMind(r).quietUntil = s.time + (100 - profileFor(r).temperament.acceptsAt);
}

export function aspirationStatus(s, r, catalog) {
  const wish = profileFor(r).aspiration;
  const projects = s.projects.filter(p => p.key === wish.key);
  const complete = projects.some(p => p.work >= catalog[p.key].work);
  return {...wish, status: complete ? 'Built' : projects.length ? 'Taking shape' : 'Hoping for this', complete};
}

export function noticeAspiration(s, r, catalog) {
  if (r.mind?.fulfilled === profileFor(r).aspiration.key) return;
  const wish = aspirationStatus(s, r, catalog);
  if (!wish.complete || r.mind?.fulfilled === wish.key) return;
  ensureMind(r).fulfilled = wish.key;
  remember(s, r, 'milestone', `${wish.label} is built. ${wish.reason}`);
}

// Preferences only rank work within an already chosen category. They never
// override food/water priorities, steal assignments, or create player blueprints.
export function workPreference(r, key) {
  const profile = profileFor(r);
  return (profile.aspiration.key === key ? 3 : 0) + (profile.strengths.includes(key) ? 2 : 0);
}

export function leisurePreference(r, kind) {
  const favorites = profileFor(r).favorites;
  const rank = favorites.indexOf(kind);
  return rank < 0 ? 0 : favorites.length - rank;
}

export function currentThought(s, r, catalog) {
  if (r.needTask?.kind === 'social') return `Making time to talk about ${r.needTask.conversation?.topic || 'life in the village'}.`;
  if (r.needTask?.kind === 'fun') return profileFor(r).reflection;
  if (r.tentPhase || r.sleepUntil) return 'Time to rest. The village can wait a little.';
  const worry = concern(s, r);
  if (worry) return worry;
  const project = s.projects.find(p => p.id === r.job);
  if (project && project.key === profileFor(r).aspiration.key) return profileFor(r).aspiration.reason;
  if (project && workPreference(r, project.key)) return 'This is work I know how to do. I want to do it well.';
  return aspirationStatus(s, r, catalog).complete ? 'Something I hoped for is here. I want to enjoy it too.' : profileFor(r).aspiration.reason;
}

export function validMind(r, people, time) {
  const m = r.mind;
  if (m === undefined) return true; // Existing villages acquire memories as they live.
  return !!m && typeof m === 'object' && !Array.isArray(m) &&
    Number.isFinite(m.quietUntil) && m.quietUntil >= 0 && m.quietUntil <= time + 100 &&
    (m.fulfilled === undefined || m.fulfilled === profileFor(r).aspiration.key) &&
    Array.isArray(m.memories) && m.memories.length <= 6 && m.memories.every(memory =>
      memory && ['conversation', 'personal', 'milestone'].includes(memory.kind) &&
      typeof memory.text === 'string' && memory.text.length > 0 && memory.text.length <= 300 &&
      Number.isFinite(memory.time) && memory.time >= 0 && memory.time <= time &&
      (memory.other === undefined || (memory.other !== r.id && people.some(p => p.id === memory.other))));
}
