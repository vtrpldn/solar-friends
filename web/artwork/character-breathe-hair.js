import {hairClipProvider,installHairClipReview} from './character-hair-clip.js';
// Retain the breathing entry points while sharing source-bound composition.
export const breatheHairProvider=frames=>hairClipProvider(frames,'breathe');
export const installBreatheHairReview=options=>installHairClipReview({...options,clip:'breathe'});
