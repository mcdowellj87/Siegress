import bpy
import math
import random
from mathutils import Vector

# -----------------------------------
# Clean old
# -----------------------------------
for obj in list(bpy.data.objects):
    if "DouglasFir" in obj.name:
        bpy.data.objects.remove(obj, do_unlink=True)

random.seed(44)

HEIGHT = 42
TRUNK_RADIUS_BASE = 0.6
TRUNK_RADIUS_TOP = 0.06
BRANCH_START = 0.35
WHORLS = 32

# -----------------------------------
# Trunk
# -----------------------------------
bpy.ops.mesh.primitive_cylinder_add(
    vertices=5,
    radius=1,
    depth=HEIGHT,
    location=(0,0,HEIGHT/2)
)
trunk = bpy.context.object
trunk.name = "DouglasFir_Trunk"
trunk.scale = (TRUNK_RADIUS_BASE, TRUNK_RADIUS_BASE, 1)

for v in trunk.data.vertices:
    zf = v.co.z / HEIGHT
    r = TRUNK_RADIUS_TOP + (TRUNK_RADIUS_BASE - TRUNK_RADIUS_TOP)*(1-zf)**2.0
    v.co.x *= r / TRUNK_RADIUS_BASE
    v.co.y *= r / TRUNK_RADIUS_BASE

# -----------------------------------
# Clean Bow Branch
# -----------------------------------
def make_branch(start, direction, length, sag, thickness):

    curve = bpy.data.curves.new("branch", type='CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = thickness
    curve.bevel_resolution = 3

    spline = curve.splines.new('POLY')
    spline.points.add(30)

    direction = direction.normalized()
    gravity = Vector((0,0,-1))

    for i in range(31):
        t = i / 30
        pos = start + direction * (length * t)
        pos += gravity * (sag * length * t * (1 - t) * 1.4)

        spline.points[i].co = (pos.x, pos.y, pos.z, 1)

    obj = bpy.data.objects.new("DouglasFir_Branch", curve)
    bpy.context.collection.objects.link(obj)

# -----------------------------------
# Branch Generation
# -----------------------------------
for i in range(WHORLS):

    t = i / WHORLS
    z = HEIGHT * (BRANCH_START + (1 - BRANCH_START) * t)

    # --- GRADUAL length falloff ---
    length = 16.0 * (1 - t*0.6)
    length *= random.uniform(0.96, 1.04)

    # --- Top 2% compression ---
    if t > 0.98:
        length *= (1 - (t - 0.98) * 40)

    # Sag stronger lower
    sag = 0.20 * (1 - t)**0.9

    thickness = 0.18 * (1 - t)**0.8

    count = random.randint(3,5)
    phase = random.random() * math.tau

    for j in range(count):

        angle = phase + (j/count)*math.tau + random.uniform(-0.1,0.1)

        # Height-based vertical bias
        if t < 0.4:
            vertical_bias = -0.05
        elif t < 0.8:
            vertical_bias = 0.05
        else:
            vertical_bias = 0.35   # strong upward reach

        direction = Vector((
            math.cos(angle),
            math.sin(angle),
            vertical_bias
        )).normalized()

        trunk_r = TRUNK_RADIUS_TOP + (TRUNK_RADIUS_BASE - TRUNK_RADIUS_TOP)*(1-t)**2.0

        start = Vector((
            direction.x * trunk_r * 1.05,
            direction.y * trunk_r * 1.05,
            z
        ))

        make_branch(start, direction, length, sag, thickness)

# -----------------------------------
# Leader
# -----------------------------------
bpy.ops.mesh.primitive_cone_add(
    vertices=12,
    radius1=0.15,
    radius2=0.01,
    depth=6,
    location=(0,0,HEIGHT + 3)
)
leader = bpy.context.object
leader.name = "DouglasFir_Leader"

print("Douglas Fir v7 generated — tall PNW specimen.")
