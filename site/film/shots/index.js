/* Film mode: the shot types. Each is one small file with one interface, so a new type is a new
   file and a line here, and touches none of the others (docs/FILM_MODE.md, "Adding a shot type"):
     type, track          its name, and the track it runs on unless a shot says otherwise
     validate(shot, ctx)  a list of faults in plain words, empty when the shot is sound
     prepare(shot, env)   worked out once: what draw needs (env: ctx, from, prev, next, index, seconds)
     draw(u, F, data, env) writes the frame `F` for `u`, how far through the shot (0 to 1)
     duration(shot)?      for a type whose length follows from its parts
     cues(item)?          times inside the shot worth knowing
   A camera shot says where the camera is and which card is up; an overlay adds to `F.ov` what
   overlays.js draws over the map. timeTravel (borders by year) is not here: the site has no
   borders by year, and capabilities() lists a type only when it can be drawn. */
import fly from './fly.js';
import hold from './hold.js';
import camera from './camera.js';
import step from './step.js';
import orbit from './orbit.js';
import pushIn from './pushIn.js';
import overview from './overview.js';
import picture from './picture.js';
import highlight from './highlight.js';
import route from './route.js';
import marker from './marker.js';
import label from './label.js';
import stamp from './stamp.js';
import compare from './compare.js';

export const SHOTS = { fly, camera, orbit, pushIn, overview, hold, step, picture, highlight, route, marker, label, stamp, compare };
