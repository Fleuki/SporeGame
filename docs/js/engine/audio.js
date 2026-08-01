export class AudioManager {
  constructor(loader){ this.loader=loader; this.musicVolume=0.4; this.sfxVolume=0.6; this.currentMusic=null; this.muted=false; }
  playMusic(key,loop=true){
    const audio=this.loader.getSound(key); if(!audio||this.currentMusic===audio) return;
    this.stopMusic(); audio.loop=loop; audio.volume=this.muted?0:this.musicVolume; audio.play().catch(()=>{}); this.currentMusic=audio;
  }
  stopMusic(){ if(this.currentMusic){ this.currentMusic.pause(); this.currentMusic.currentTime=0; this.currentMusic=null; } }
  playSfx(key){ if(this.muted) return; const audio=this.loader.getSound(key); if(!audio) return; const clone=audio.cloneNode(); clone.volume=this.sfxVolume; clone.play().catch(()=>{}); }
  toggleMute(){ this.muted=!this.muted; if(this.currentMusic) this.currentMusic.volume=this.muted?0:this.musicVolume; return this.muted; }
}