export class AssetLoader {
  constructor(){ this.images=new Map(); this.sounds=new Map(); this.loaded=0; this.total=0; }
  loadImage(key,src){
    return new Promise((resolve)=>{
      const img=new Image();
      img.onload=()=>{ this.images.set(key,img); this.loaded++; resolve(img); };
      img.onerror=()=>{ console.warn("Не загрузилось:",src); resolve(null); };
      img.src=src; this.total++;
    });
  }
  loadSound(key,src){
    return new Promise((resolve)=>{
      const audio=new Audio();
      audio.oncanplaythrough=()=>{ this.sounds.set(key,audio); this.loaded++; resolve(audio); };
      audio.onerror=()=>{ console.warn("Не загрузился звук:",src); resolve(null); };
      audio.src=src; this.total++;
    });
  }
  getImage(key){ return this.images.get(key); }
  getSound(key){ return this.sounds.get(key); }
  async loadAll(cfg){
    const promises=[];
    for(const [k,p] of Object.entries(cfg.images||{})) promises.push(this.loadImage(k,p));
    for(const [k,p] of Object.entries(cfg.sounds||{})) promises.push(this.loadSound(k,p));
    await Promise.all(promises);
    console.log("Ассеты:",this.loaded,"/",this.total);
  }
}