"""
Athlete builder: Quaternius CC0 packs -> one animated athlete GLB.

Inputs (downloaded from quaternius.itch.io, CC0 — see public/models/CREDITS.md):
  - Universal Base Characters [Standard]: Superhero_Male_FullBody.gltf (UE rig)
  - Universal Animation Library [Standard]: UAL1_Standard.glb (same 65-joint rig)

What it does:
  1. imports the character, classifies body faces into kit zones by dominant
     bone weight + rest height, and assigns flat tintable materials named
     Jersey / Shorts / Socks / Boots / Skin (runtime recolors by name);
  2. attaches a hairstyle + eyebrows (parented to the head bone);
  3. imports the UAL clips and stacks the sport-relevant ones as NLA tracks
     (renamed to semantic names: idle/walk/jog/sprint/celebrate/dive/...);
  4. exports public/models/characters/athlete.glb (no textures — flat colors).

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/build-athlete.py -- <ubc_dir> <ual_glb>
"""

import bpy
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
UBC = argv[0] if argv else os.path.expanduser("~/Downloads/ubc")
UAL_GLB = argv[1] if len(argv) > 1 else os.path.expanduser("~/Downloads/UAL1_Standard.glb")
OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "public", "models", "characters", "athlete.glb"
)

CHAR = os.path.join(UBC, "Base Characters", "Godot - UE", "Superhero_Male_FullBody.gltf")
HAIR = os.path.join(UBC, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)", "Hair_Buzzed.gltf")
BROWS = os.path.join(UBC, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)", "Eyebrows_Regular.gltf")

# UAL clip -> semantic name used by the app
CLIPS = {
    "Idle_Loop": "idle",
    "Walk_Loop": "walk",
    "Jog_Fwd_Loop": "jog",
    "Sprint_Loop": "sprint",
    "Jump_Start": "jump_start",
    "Jump_Loop": "jump_loop",
    "Jump_Land": "jump_land",
    "Dance_Loop": "celebrate",
    "Roll": "dive",
    "Hit_Chest": "hit",
    "Punch_Cross": "punch",
    "Crouch_Idle_Loop": "ready",
    "Crouch_Fwd_Loop": "shuffle",
}

# kit-zone bone sets (UE-style names)
JERSEY_BONES = {"spine_01", "spine_02", "spine_03", "spine_04", "spine_05",
                "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r"}
SHORTS_BONES = {"pelvis", "thigh_l", "thigh_r"}
SOCKS_BONES = {"calf_l", "calf_r"}
BOOTS_BONES = {"foot_l", "foot_r", "ball_l", "ball_r"}

COLORS = {
    "Jersey": (0.8, 0.1, 0.15, 1),
    "Shorts": (0.08, 0.08, 0.2, 1),
    "Socks": (0.9, 0.9, 0.9, 1),
    "Boots": (0.05, 0.05, 0.06, 1),
    "Skin": (0.75, 0.55, 0.38, 1),
    "Hair": (0.1, 0.07, 0.05, 1),
    "Eyes": (0.08, 0.07, 0.07, 1),
}


def flat_material(name: str) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = COLORS[name]
    bsdf.inputs["Roughness"].default_value = 0.75
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.15
    return mat


def import_gltf(path: str):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # ---- character -----------------------------------------------------------
    objs = import_gltf(CHAR)
    arm = next(o for o in objs if o.type == "ARMATURE")
    meshes = [o for o in objs if o.type == "MESH"]
    body = max(meshes, key=lambda o: len(o.data.vertices))
    print("armature:", arm.name, "| body:", body.name, "verts:", len(body.data.vertices))
    print("meshes:", [(m.name, [s.material.name if s.material else None for s in m.material_slots]) for m in meshes])

    # ---- kit-zone classification --------------------------------------------
    mats = {n: flat_material(n) for n in ["Jersey", "Shorts", "Socks", "Boots", "Skin"]}
    me = body.data
    body.data.materials.clear()
    order = ["Jersey", "Shorts", "Socks", "Boots", "Skin"]
    for n in order:
        body.data.materials.append(mats[n])
    idx = {n: i for i, n in enumerate(order)}

    # rest-pose heights for band decisions (armature space, z-up in Blender)
    def bone_z(name: str) -> float:
        b = arm.data.bones.get(name)
        return (arm.matrix_world @ b.head_local).z if b else 0.0

    hip_z = bone_z("thigh_l")
    knee_z = bone_z("calf_l")
    ankle_z = bone_z("foot_l")
    shorts_hem = knee_z + (hip_z - knee_z) * 0.45  # mid-thigh
    socks_top = knee_z - 0.02
    print(f"hip={hip_z:.3f} knee={knee_z:.3f} ankle={ankle_z:.3f}")

    gname = {g.index: g.name for g in body.vertex_groups}
    mw = body.matrix_world

    # Per-FACE classification: average bone weights over the face's verts and
    # band by the face-centre height. This gives clean hems along edge loops
    # instead of the sawtooth a per-vertex majority vote produces.
    def face_zone(poly) -> str:
        weights: dict = {}
        cz = 0.0
        for vi in poly.vertices:
            v = me.vertices[vi]
            cz += (mw @ v.co).z
            for g in v.groups:
                n = gname.get(g.group, "")
                weights[n] = weights.get(n, 0.0) + g.weight
        cz /= len(poly.vertices)
        best = max(weights, key=weights.get) if weights else ""
        if best in BOOTS_BONES:
            return "Boots"
        if best in SOCKS_BONES:
            return "Socks" if cz < socks_top else "Skin"
        if best in SHORTS_BONES:
            return "Shorts" if cz > shorts_hem else "Skin"
        if best in JERSEY_BONES:
            return "Jersey"
        return "Skin"

    for poly in me.polygons:
        poly.material_index = idx[face_zone(poly)]

    # Smooth zone boundaries: a few rounds of neighbour-majority relaxation
    # removes the sawtooth "torn hem" speckle the raw classification leaves.
    edge_faces: dict = {}
    for poly in me.polygons:
        for ek in poly.edge_keys:
            edge_faces.setdefault(ek, []).append(poly.index)
    neighbours = [[] for _ in me.polygons]
    for faces in edge_faces.values():
        if len(faces) == 2:
            a, b = faces
            neighbours[a].append(b)
            neighbours[b].append(a)
    for _ in range(3):
        current = [p.material_index for p in me.polygons]
        for poly in me.polygons:
            ns = neighbours[poly.index]
            if not ns:
                continue
            votes: dict = {}
            for n in ns:
                votes[current[n]] = votes.get(current[n], 0) + 1
            best, cnt = max(votes.items(), key=lambda kv: kv[1])
            # flip only when clearly outvoted by a single surrounding zone
            if best != poly.material_index and cnt >= max(2, len(ns) - 1):
                poly.material_index = best
    counts = {n: 0 for n in order}
    for p in me.polygons:
        counts[order[p.material_index]] += 1
    print("zone faces:", counts)

    # ---- face meshes (eyes/brows already on the model) -----------------------
    eye_mat = flat_material("Eyes")
    hair_mat = flat_material("Hair")
    for m in list(meshes):
        if m is body:
            continue
        if not m.material_slots or "Icosphere" in m.name:
            # stray helper geometry in the source file
            bpy.data.objects.remove(m, do_unlink=True)
            meshes.remove(m)
            continue
        for slot in m.material_slots:
            src = slot.material.name if slot.material else ""
            slot.material = hair_mat if "Hair" in src else eye_mat

    # ---- hairstyle (model already includes eyebrows) --------------------------
    for path in (HAIR,):
        added = import_gltf(path)
        h_arm = next((o for o in added if o.type == "ARMATURE"), None)
        for o in added:
            if o.type != "MESH":
                continue
            if not o.material_slots or "Icosphere" in o.name or "Sphere" in o.name:
                bpy.data.objects.remove(o, do_unlink=True)  # placeholder head etc.
                continue
            for slot in o.material_slots:
                slot.material = hair_mat
            # re-target the skin modifier at the character armature (same rig)
            for mod in o.modifiers:
                if mod.type == "ARMATURE":
                    mod.object = arm
            o.parent = arm
        if h_arm:
            bpy.data.objects.remove(h_arm, do_unlink=True)

    # ---- animations from UAL --------------------------------------------------
    before_actions = set(bpy.data.actions)
    ual_objs = import_gltf(UAL_GLB)
    new_actions = [a for a in bpy.data.actions if a not in before_actions]
    print("imported actions:", len(new_actions))

    # True retarget: the two rigs share bone NAMES but not rest orientations,
    # so copying fcurves bends limbs wrong. Instead, constrain every character
    # bone to the same-named UAL bone in WORLD space (+ pelvis location) and
    # bake each clip onto the character with visual keying.
    ual_arm = next(o for o in ual_objs if o.type == "ARMATURE")
    ual_arm.animation_data_create()

    for pb in arm.pose.bones:
        if pb.name in ual_arm.pose.bones:
            con = pb.constraints.new("COPY_ROTATION")
            con.target = ual_arm
            con.subtarget = pb.name
            if pb.name == "pelvis":
                loc = pb.constraints.new("COPY_LOCATION")
                loc.target = ual_arm
                loc.subtarget = pb.name

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    arm.animation_data_create()

    kept = 0
    for act in new_actions:
        base = act.name.split(".")[0]
        if base not in CLIPS:
            continue
        ual_arm.animation_data.action = act
        f0, f1 = (int(act.frame_range[0]), int(act.frame_range[1]))
        bpy.ops.nla.bake(
            frame_start=f0,
            frame_end=f1,
            only_selected=False,
            visual_keying=True,
            clear_constraints=False,
            use_current_action=False,
            bake_types={"POSE"},
        )
        baked = arm.animation_data.action
        baked.name = CLIPS[base]
        track = arm.animation_data.nla_tracks.new()
        track.name = baked.name
        track.strips.new(baked.name, f0, baked)
        track.mute = True
        arm.animation_data.action = None
        kept += 1
    print("kept clips:", kept)

    # remove the retarget constraints and source actions, and clear the
    # residual last-baked pose so the GLB's default state is the bind pose
    for pb in arm.pose.bones:
        for con in list(pb.constraints):
            pb.constraints.remove(con)
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
    for act in new_actions:
        if act.users == 0:
            bpy.data.actions.remove(act)

    # drop the UAL mannequin + its armature
    for o in ual_objs:
        bpy.data.objects.remove(o, do_unlink=True)

    # strip textures/images so the export is tiny flat-shaded
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=False,  # keep skinning intact
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_skins=True,
        export_lights=False,
        export_cameras=False,
    )
    print("exported", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
