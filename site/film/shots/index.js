/* Film mode: the shot types. Each is one small file with one interface, so a new type is a new
   file and a line here, and touches none of the others (docs/FILM_MODE.md, "Adding a shot type"):
     type, track          its name, and the track it runs on unless a shot says otherwise
     validate(shot, ctx)  a list of faults in plain words, empty when the shot is sound
     prepare(shot, env)   worked out once: what draw needs (env: ctx, from, prev, next, index)
     draw(u, F, data, env) writes the frame `F` for `u`, how far through the shot (0 to 1)
     duration(shot)?      for a type whose length follows from its parts
     cues(item)?          times inside the shot worth knowing */
import fly from './fly.js';
import hold from './hold.js';
import camera from './camera.js';
import step from './step.js';

export const SHOTS = { fly, hold, camera, step };
