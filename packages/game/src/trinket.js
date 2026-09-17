import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {cloneTrophy,cloneGoldCrown,cloneBetaCoin,cloneRibbonMedal,applyAwardMetalFinish} from './award-mesh';
export async function showTrinket(key){
 const choices={trophy:'trophy',bronze:'bronze',crown:'crown',ribbon:'beta','medal-bronze':'ribbon','medal-silver':'ribbon','medal-gold':'ribbon','champion-cup':'trophy','showcase-crown':'crown'};
 if(!choices[key])throw new Error('Unknown trinket');
 document.body.replaceChildren();const scene=new THREE.Scene();scene.background=new THREE.Color('#101922');
 const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.01,100);camera.position.set(0,0,4);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xffffff,0x334455,3));for(const x of [-3,3]){const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(x,3,5);scene.add(light);}
 const source=(await new GLTFLoader().loadAsync(`./${choices[key]}.glb`)).scene;
 let model=key==='ribbon'?cloneBetaCoin(source):key==='trophy'?cloneTrophy(source):key.includes('crown')?cloneGoldCrown(source):key.startsWith('medal-')?cloneRibbonMedal(source,{color:key==='medal-gold'?'#d2a43b':key==='medal-silver'?'#aeb8bf':'#a9612d',metalness:.84,roughness:.3}):source;
 if(model===source)applyAwardMetalFinish(model,{color:key==='bronze'?'#d58b52':'#d8aa39',metalness:.85,roughness:.25});
 const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());model.position.sub(center);const group=new THREE.Group();group.add(model);group.scale.setScalar(2/Math.max(size.x,size.y,size.z));scene.add(group);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
 renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
}
