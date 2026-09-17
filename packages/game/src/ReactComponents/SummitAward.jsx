import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { awardModelUrl } from "../award-model-url";
import {
  addDashboardAwardLights,
  attachAwardEnvironment,
  configureAwardRenderer,
  finishAwardModel,
  frameAward,
} from "../award-render";
import { summitAwardAtom } from "../store";

function awardFile(award) {
  if (award === "bronze") return "bronze.glb";
  if (award === "crown") return "crown.glb";
  return "trophy.glb";
}

export default function SummitAward() {
  const award = useAtomValue(summitAwardAtom);
  const canvasRef = useRef(null);
  const loadRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    configureAwardRenderer(renderer);
    addDashboardAwardLights(scene);
    const detachEnv = attachAwardEnvironment(renderer, scene);

    const loader = new GLTFLoader();
    let model = null;
    let frameId = 0;
    let requestId = 0;
    let lastTime = 0;

    const disposeModel = () => {
      if (!model) return;
      scene.remove(model);
      model.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          materials.forEach((material) => material.dispose());
        }
      });
      model = null;
    };

    const resize = () => {
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    loadRef.current = (nextAward) => {
      const id = (requestId += 1);
      loader.load(awardModelUrl(awardFile(nextAward)), (gltf) => {
        if (id !== requestId) return;
        disposeModel();
        model = gltf.scene.clone(true);
        finishAwardModel(model, nextAward);
        if (awardFile(nextAward) === "crown.glb") {
          model.rotation.y = -0.28;
        }
        scene.add(model);
        frameAward(camera, model);
      });
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    loadRef.current(award);

    const render = (time) => {
      const delta = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0;
      lastTime = time;
      if (model) {
        model.rotation.y += delta * 0.55;
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      loadRef.current = null;
      disposeModel();
      detachEnv();
      renderer.dispose();
    };
    // Renderer stays mounted; award swaps load a new model only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRef.current?.(award);
  }, [award]);

  return (
    <canvas
      aria-label="Summit award"
      className="summit-award"
      ref={canvasRef}
    />
  );
}
