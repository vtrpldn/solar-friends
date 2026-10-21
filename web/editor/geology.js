const materials={earth:'Earth',stone:'Stone',salvage:'Reclaimed material'};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class GeologyEditor {
  constructor(root,{change,focus,defaults,center}){
    this.root=root;this.change=change;this.focus=focus;this.center=center;
    this.limits=Object.fromEntries(Object.keys(materials).map(key=>[key,defaults.filter(p=>p.material===key).reduce((sum,p)=>sum+p.quantity,0)]));
    root.addEventListener('change',e=>{
      const row=e.target.closest('[data-patch]'),field=e.target.dataset.field;if(!row||!field)return;
      const id=row.dataset.patch,value=Number(e.target.value);
      this.edit('Edit geological patch',patches=>{const p=patches.find(p=>p.id===id);if(p)p[field]=value;});
    });
    root.addEventListener('click',e=>{
      const action=e.target.closest('[data-geology-action]')?.dataset.geologyAction;if(!action)return;
      const id=e.target.closest('[data-patch]')?.dataset.patch;
      if(action==='clear')this.edit('Clear reserve patches',patches=>patches.splice(0));
      if(action==='remove')this.edit('Remove reserve patch',patches=>{const i=patches.findIndex(p=>p.id===id);if(i>=0)patches.splice(i,1);});
      if(action==='focus'){const p=this.patches.find(p=>p.id===id);if(p)this.focus(p);}
      if(action==='add'){
        const material=root.querySelector('[data-geology-material]').value,identity=crypto.randomUUID(),[x,y]=this.center();
        this.edit('Add reserve patch',patches=>{
          if(patches.length>=64)throw Error('Use up to 64 reserve patches.');
          const available=this.limits[material]-patches.filter(p=>p.material===material).reduce((sum,p)=>sum+p.quantity,0);
          if(available<1)throw Error(`All ${materials[material].toLowerCase()} reserves are assigned. Adjust existing patches or clear the geology first.`);
          patches.push({id:identity,material,x:Math.max(0,Math.min(60,Math.round(x))),y:Math.max(0,Math.min(60,Math.round(y))),width:4,height:4,quantity:Math.min(12,available)});
        });
      }
    });
  }
  edit(label,mutator){const existing=structuredClone(this.patches);this.change(label,d=>{d.map.deposits=structuredClone(existing);mutator(d.map.deposits);});}
  render(definition,report){
    this.patches=definition.map.deposits??report.deposits.map(p=>({id:`patch-${p.id}`,material:Object.keys(materials)[p.material-2],x:p.x,y:p.y,width:p.width,height:p.height,quantity:p.maximum}));
    const selected=this.root.querySelector('[data-geology-material]')?.value||'earth';
    const totals=Object.keys(materials).map(key=>`${materials[key]} ${this.patches.filter(p=>p.material===key).reduce((s,p)=>s+p.quantity,0)} / ${this.limits[key]}`);
    this.root.innerHTML=`<p class="creator-map-note">Finite reserves in the ground, separate from starting supplies. ${totals.map(escape).join(' · ')}.</p><div class="creator-field"><label for="creator-new-patch">New reserve type</label><select id="creator-new-patch" data-geology-material>${Object.entries(materials).map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select></div><div class="creator-selection-actions"><button data-geology-action="add">Add patch</button><button data-geology-action="clear">Clear geology</button></div>${this.patches.map((p,i)=>`<div class="creator-geopatch" data-patch="${escape(p.id)}"><h3>${escape(materials[p.material]||p.material)} · ${i+1}</h3><div class="creator-coordinates">${[['x','Column',0,63],['y','Row',0,63],['width','Width',1,64],['height','Height',1,64],['quantity','Reserve',1,this.limits[p.material]||600]].map(([key,label,min,max])=>`<div class="creator-field"><label for="geology-${i}-${key}">${label}</label><input id="geology-${i}-${key}" data-field="${key}" type="number" step="1" min="${min}" max="${max}" value="${escape(p[key])}"></div>`).join('')}</div><div class="creator-selection-actions"><button data-geology-action="focus">Show patch</button><button data-geology-action="remove">Remove patch</button></div></div>`).join('')}`;
    this.root.querySelector('[data-geology-material]').value=selected;
  }
}
