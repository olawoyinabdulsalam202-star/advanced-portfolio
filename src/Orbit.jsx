import React,{useEffect,useRef} from 'react';
export default function Orbit({paused}) {
 const ref=useRef(null);
 useEffect(()=>{
  const canvas=ref.current,ctx=canvas.getContext('2d');if(!ctx)return;
  let raf,t=0,w=0,h=0,active=true,last=0;const pointer={x:0,y:0};
  const resize=()=>{const box=canvas.getBoundingClientRect();w=box.width;h=box.height;const d=Math.min(devicePixelRatio,2);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);};
  const ro=new ResizeObserver(resize);ro.observe(canvas);resize();
  const io=new IntersectionObserver(([e])=>{active=e.isIntersecting;if(active&&!raf)raf=requestAnimationFrame(draw)});io.observe(canvas);
  const move=e=>{const r=canvas.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width-.5;pointer.y=(e.clientY-r.top)/r.height-.5};
  canvas.addEventListener('pointermove',move);const leave=()=>{pointer.x=pointer.y=0};canvas.addEventListener('pointerleave',leave);
  function draw(time){raf=0;if(!active)return;if(time-last<32&&!paused){raf=requestAnimationFrame(draw);return}last=time;if(!paused)t+=.006;
   ctx.clearRect(0,0,w,h);const size=Math.min(w,h)*.285;
   const glow=ctx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,size*1.8);glow.addColorStop(0,'#badc6c15');glow.addColorStop(1,'#11130f00');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
   const angle=t*.6+pointer.x*.45,tilt=.64+pointer.y*.35;
   function project(x,y,z){let a=x*Math.cos(angle)-z*Math.sin(angle),b=x*Math.sin(angle)+z*Math.cos(angle);let c=y*Math.cos(tilt)-b*Math.sin(tilt),d=y*Math.sin(tilt)+b*Math.cos(tilt);const scale=3.7/(3.7+d*.22);return [w*.5+a*size*scale,h*.5+c*size*scale,d];}
   const lines=[];
   for(let j=0;j<36;j++){const v=j/36*Math.PI*2,points=[];let depth=0;for(let i=0;i<=160;i++){const u=i/160*Math.PI*2,r=1+.34*Math.cos(v+u*3);const p=project(r*Math.cos(u),.34*Math.sin(v+u*3),r*Math.sin(u));points.push(p);depth+=p[2];}lines.push({points,depth:depth/161,j});}
   lines.sort((a,b)=>b.depth-a.depth);
   for(const l of lines){ctx.beginPath();l.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));const lit=Math.max(.12,Math.min(.98,.62-l.depth*.22));ctx.strokeStyle=l.j%6===0?`rgba(208,255,113,${lit})`:`rgba(186,197,165,${lit*.72})`;ctx.lineWidth=l.j%6===0?1.45:.8;ctx.stroke();}
   for(let j=0;j<3;j++){ctx.beginPath();for(let i=0;i<=160;i++){let a=i/160*Math.PI*2;let p=project(Math.cos(a)*(1.55+j*.09),Math.sin(a)*(.5+j*.05),Math.sin(a)*1.3);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])}ctx.strokeStyle='#d0ff711c';ctx.lineWidth=.6;ctx.stroke();}
   for(let i=0;i<5;i++){const a=t*(.5+i*.07)+i*1.3;const p=project(Math.cos(a)*1.6,Math.sin(a)*.6,Math.sin(a)*1.4);ctx.beginPath();ctx.arc(p[0],p[1],i===0?3:1.5,0,Math.PI*2);ctx.fillStyle='#d0ff71';ctx.shadowBlur=12;ctx.shadowColor='#d0ff71';ctx.fill();ctx.shadowBlur=0;}
   if(!paused)raf=requestAnimationFrame(draw);
  }
  raf=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(raf);ro.disconnect();io.disconnect();canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave)};
 },[paused]);
 return <canvas ref={ref} className="orbit-canvas" aria-label="An animated, interwoven orbital sculpture that responds to your pointer" role="img"/>;
}
