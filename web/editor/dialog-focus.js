// Keep keyboard navigation within the active modal, including when a native
// dialog boundary would otherwise move focus into browser chrome.
export function wrapDialogTab(event,root=document){
 if(event.code!=='Tab')return false;
 const open=[...root.querySelectorAll('dialog[open]')],dialog=root.activeElement?.closest('dialog[open]')??open.at(-1);
 if(!dialog)return false;
 const controls=[...dialog.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')].filter(el=>el.tabIndex>=0&&!el.matches(':disabled')&&!el.closest('[inert]')&&el.getClientRects().length);
 const first=controls[0],last=controls.at(-1),active=root.activeElement;
 if(!first){event.preventDefault();dialog.tabIndex=-1;dialog.focus();return true;}
 if(!dialog.contains(active)||(event.shiftKey&&active===first)||(!event.shiftKey&&active===last)){
  event.preventDefault();(event.shiftKey?last:first).focus();return true;
 }
 return false;
}
