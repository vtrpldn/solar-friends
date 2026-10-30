import {EditorDocument} from './document.js';
import {draftImportIssue} from './draft-import.js';

// Local storage and session recovery need the same structural/version boundary
// as file imports. Gameplay errors (for example an unfinished empty cast) do
// not make an editable checkpoint corrupt and must not revert player edits.
export function restoreEditableCheckpoint(checkpoint,validate){
 const doc=EditorDocument.restore(checkpoint);
 const issue=draftImportIssue(validate(JSON.stringify(doc.value)));
 if(issue)throw Error(issue.message);
 return doc;
}
