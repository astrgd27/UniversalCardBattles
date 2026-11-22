#!/usr/bin/env python3
"""NIGHTFALL art prompts for image generators (written for ChatGPT image generation).

    python3 tools/nightfall/art_prompts.py   ->  docs/nightfall-art-prompts.md and tools/nightfall/art_prompts.json

Each prompt = STYLE block (the physical artifact: medium, printing, paper, period) + SCENE (subject, staging,
light, palette, period props) + FORMAT + AVOID. Scenes follow the Game Design Document's prompts, enriched, with
costumes and props moved into the style's own era so the image reads as genuinely of that period.
"""
import json, os

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', '..')

STYLES = {
    'PULP': {
        'name': '1930s pulp magazine cover',
        'style': (
            "STYLE: a real original oil painting made in 1936 for the cover of a pulp horror magazine, the kind printed on cheap "
            "wood-pulp paper and sold on newsstands for a dime, photographed flat and in full. Painted fast and confidently in thick "
            "oils on canvas board: visible bristle-brush strokes, impasto highlights, loose painterly edges, nothing airbrushed. "
            "A limited, punchy palette of cadmium red, chrome yellow, deep ultramarine and viridian over heavy warm-black shadows. "
            "Theatrical, melodramatic staging like a stage play: exaggerated poses, wide terrified eyes, a menacing figure looming over "
            "a victim, hot under-lighting or one fierce light source. 1930s clothing, hair, cars and props only. Slight age: yellowed "
            "varnish and a soft color shift."),
        'avoid': "digital painting, smooth gradients, airbrush, photorealism, modern faces or makeup, concept art, 3D render, CGI lighting, clean vector lines, lens blur, HDR",
    },
    'COMIC': {
        'name': '1950s pre-Code horror comic',
        'style': (
            "STYLE: a single panel scanned from an actual horror comic book printed in 1952, before the Comics Code. Drawn in black "
            "ink with brush and crow-quill pen: bold confident contour lines, large solid black areas, feathered brush hatching and "
            "cross-hatching for every shadow, with no painted shading at all. Color is flat four-color letterpress: only flat fills of "
            "cyan, magenta, yellow and their simple mixes, with visible Ben-Day halftone dots in skin, skies and backgrounds, and "
            "slight color misregistration where the color plates miss the ink lines. Printed on cheap newsprint aged to a warm "
            "yellow-beige, with paper fiber and a little ink bleed. Lurid, high-contrast horror-comic drama: grotesque faces, wide "
            "shocked eyes, beads of sweat, tilted dramatic angles. 1950s clothing, hair, cars and props. No speech balloons, captions, "
            "sound effects or lettering."),
        'avoid': "digital painting, painterly brushwork, gradients, airbrush, soft shading, glossy highlights, 3D, manga, webcomic style, clean digital lines, modern clothing",
    },
    'PAPERBACK': {
        'name': '1970s–80s horror paperback cover',
        'style': (
            "STYLE: the original cover painting of a mass-market horror paperback published around 1979–1985, as reproduced on the "
            "book's glossy cover. Gouache, acrylic and airbrush on illustration board: tightly hand-painted realistic faces and hands "
            "(painted, not photographed), smooth airbrushed mist and glows, glossy specular highlights on eyes, wet surfaces and metal. "
            "A very dark composition where most of the image falls into deep black, one dramatic light source and a strong colored rim "
            "light (blood red, cold blue or sickly green). Moody, cinematic and quietly menacing rather than busy. Late-1970s/1980s "
            "hair, clothes, cars and interiors. Subtle printing grain and slightly faded, warm cover colors."),
        'avoid': "modern digital painting, concept-art or ArtStation look, video-game render, photograph, HDR, oversaturated neon, plastic skin, anime",
    },
    'LINEN': {
        'name': '1940s linen postcard',
        'style': (
            "STYLE: a real 1940s 'linen' tourist postcard from an American postcard printer, scanned flat. A textured linen-weave card "
            "stock shows through the entire image; bright, saturated but slightly chalky colors; airbrushed-looking skies; buildings and "
            "people simplified and retouched by hand; a cheerful, idealized scene. Slight printing misregistration, rounded worn corners "
            "and gentle age yellowing. No 'Greetings from' lettering and no text."),
        'avoid': "photograph, digital painting, modern buildings or cars, text, lettering",
    },
}

HYBRIDS = {
    'PULP + PAPERBACK': {
        'name': '1930s pulp drama, 1980s paperback finish',
        'style': (
            "STYLE: a 1980s horror paperback cover painting that deliberately echoes a 1930s pulp magazine cover. Pulp composition and "
            "drama: a colossal looming figure over tiny terrified people, theatrical staging, one fierce light source, a pulp palette of "
            "cadmium red, chrome yellow and ultramarine. Rendered with 1980s paperback technique: gouache and airbrush on illustration "
            "board, tight hand-painted detail, glossy highlights, deep blacks and a strong colored rim light. Subtle printing grain and "
            "slightly faded, warm cover colors."),
        'avoid': "modern digital painting, concept-art or ArtStation look, 3D render, photograph, HDR, anime, clean vector lines",
    },
    'PULP + COMIC': {
        'name': '1930s pulp poster, 1950s comic printing',
        'style': (
            "STYLE: a 1950s horror comic book cover that echoes a 1930s pulp painting: bold black brush-inked shapes and silhouettes "
            "with flat four-color letterpress fills and visible Ben-Day halftone dots, saturated red, yellow and black, strongly "
            "symmetrical and poster-like. Printed on aged, yellowed paper with slight color misregistration and a little ink bleed."),
        'avoid': "digital painting, gradients, airbrush, 3D, glossy highlights, modern graphic design, vector art",
    },
}

FORMAT_CARD = ("FORMAT: vertical portrait, 5:7 (make it 1024 x 1536). The artwork fills the whole image edge to edge: no border, frame, "
               "title, masthead, logo, price, lettering or signature. Keep faces and the key action in the upper middle, between about "
               "15% and 60% from the top, because the card shows a window of that area. Gore is implied, never shown in detail.")
FORMAT_WIDE = ("FORMAT: horizontal, 12:7 (make it 1536 x 1024), filled edge to edge, no border or lettering, the main buildings centered. "
               "Gore is implied, never shown in detail.")

# (number, card id, name, style, scene). Scenes follow the GDD, enriched; period details match the style's era.
CARDS = [
    # ---- Blood Cabal
    ('NF-010', 'councilman-doyle', 'Councilman Doyle', 'COMIC',
     "A jowly, sweating city councilman in a rumpled double-breasted suit and a carnation buttonhole stands at a bunting-draped podium on City Hall steps, "
     "shaking hands with a tall, smiling, chalk-pale man in an immaculate black overcoat. The councilman's eyes are blank white circles: hypnotised. "
     "Press photographers with Speed Graphic cameras crowd below, flashbulbs bursting in white starbursts. The pale man's shadow on the marble column "
     "has pointed ears. Palette: civic blues and golds, lurid red bunting."),
    ('NF-011', 'blood-bank-holdings', 'Blood Bank Holdings', 'PAPERBACK',
     "Night inside a sterile 1980s blood bank: a tall glass-fronted refrigerator glows deep red, packed with rows of blood bags, each stamped with a gold "
     "corporate crest of a bat over a bank column. Cold fluorescent light flickers on white tile. The long shadow of a man in a tailored suit and slicked hair "
     "stretches across the floor toward the fridge from an unseen doorway. Red glow and cold blue rim light; almost everything else black."),
    ('NF-012', 'the-velvet-club', 'The Velvet Club', 'PULP',
     "A glamorous 1930s art-deco nightclub with gold sunburst walls and a smoky haze. On a small stage a pale crooner in white tie, with slicked hair and "
     "fangs, sings into a chrome ribbon microphone. In the foreground a woman in a silver gown swoons backward into the arms of a vampire in tails, her "
     "pearls spilling. Jazz band silhouettes behind. Smoky red and gold stage light."),
    ('NF-013', 'hostile-takeover', 'Hostile Takeover', 'COMIC',
     "A black skyscraper crowned with spires shaped like bat wings rises over a street of crumbling brick row houses. Bulldozers knock down a porch while "
     "families in 1950s clothes flee with suitcases and a birdcage. A fat-cat developer in a pinstripe suit, pale with fangs, points from the foreground "
     "holding blueprints. Lurid red sky, heavy black shadows."),
    ('NF-014', 'a-quiet-word-with-the-mayor', 'A Quiet Word with the Mayor', 'PAPERBACK',
     "A frightened, balding mayor in a 1980s office sits frozen at his wide desk at night, a single green-shaded banker's lamp lighting his sweating face and "
     "a stack of papers. From the darkness behind his leather chair, one long pale hand with a signet ring rests on his shoulder; only the hand and a faint "
     "glint of fangs are visible. Deep black room, warm lamp light, thin red rim light on the hand."),
    ('NF-015', 'exsanguinate', 'Exsanguinate', 'PULP',
     "A vampire aristocrat in a 1930s tuxedo and opera cape stands on a ballroom staircase, one hand raised like a conductor. Glowing ribbons of red "
     "stream upward from a crowd of fainting society guests below toward his palm in swirling spirals. Explosive diagonal composition, swirling crimson "
     "against deep ultramarine shadows, chandelier light."),
    ('NF-016', 'nothing-to-see-here', 'Nothing to See Here', 'COMIC',
     "Night on a city street: two pale men in identical sharp suits and fedoras casually heave a rolled oriental carpet into the trunk of a long black 1950s "
     "limousine; a limp pale hand dangles from the end of the carpet. On the corner a beat cop in a peaked cap looks the other way and politely tips his cap. "
     "Darkly comic, deadpan expressions. Streetlight yellow, deep purple night."),
    # ---- Harvest Cult
    ('NF-017', 'mother-bramble', 'Mother Bramble', 'PULP',
     "A weathered, fierce old countrywoman with a crown of thorns and ripe wheat on her grey hair and a moss-green shawl, standing atop a grassy burial "
     "mound under an enormous harvest moon, arms raised. Below her, hooded villagers kneel in a ring holding lanterns and sheaves. Eerie green-gold light, "
     "her face lit from below, wind whipping the shawl."),
    ('NF-018', 'hollow-eyed-farmhand', 'Hollow-Eyed Farmhand', 'COMIC',
     "A gaunt farmhand in patched overalls and a straw hat stands at the edge of a cornfield at dusk holding a long scythe. His eye sockets are empty black "
     "hollows and he grins. Crows sit on the split-rail fence beside him. Ochre corn, purple dusk sky with halftone dots, heavy black shadows."),
    ('NF-019', 'maypole-dancers', 'Maypole Dancers', 'PAPERBACK',
     "Villagers in white smocks and carved animal masks (hare, goat, owl) dance in a circle around a tall maypole hung with ribbons and small tied bones. "
     "A frightened young outsider in a 1970s denim jacket is tied to the base of the pole. Pale overcast daylight, washed greens, an unsettling cheerful "
     "stillness, the masks lit with soft rim light."),
    ('NF-020', 'the-corn-bride', 'The Corn Bride', 'PULP',
     "A young woman in a wedding gown woven from pale corn husks walks barefoot through a golden field toward a dark hill, long ribbons trailing behind her "
     "on the wind. Her face is serene, eyes half closed. A blood-red sunset behind the hill, black crows rising, rich impasto gold in the corn."),
    ('NF-021', 'sheaf-masked-elder', 'Sheaf-Masked Elder', 'PAPERBACK',
     "A tall, thin elder in a dark farm coat wearing a mask made from a tightly bound sheaf of wheat stands in a barn doorway at night, holding a sickle "
     "in one hand and a hurricane lantern in the other. Straw dolls hang from the rafters behind. Warm lantern light on the straw mask, deep black barn, "
     "cold blue moonlight rim."),
    ('NF-022', 'the-little-people', 'The Little People', 'COMIC',
     "Under a moonlit hawthorn hedge, small pale wizened figures with oversized black eyes and pointed ears peer out from a hollow between the roots. One "
     "drags away a child's buckled shoe. A lit farmhouse window in the distance. Moonlit blues and greens in halftone, inky black hedge."),
    ('NF-023', 'thing-in-the-hedgerow', 'Thing in the Hedgerow', 'PAPERBACK',
     "On a narrow country road at night, a long-limbed creature made of twisted branches and briars bursts out of the hedgerow toward a stalled 1970s "
     "hatchback. The car's headlights catch its antlered, skull-like face. Thorns, flying leaves, white headlight beams through mist, everything else black."),
    ('NF-024', 'something-in-the-stalks', 'Something in the Stalks', 'PULP',
     "Between towering cornstalks at night, a colossal shape is glimpsed: a dozen glinting eyes and a wide mouth lined with dry husks. In the foreground a "
     "lone farmer in a 1930s work shirt raises a lantern, mouth open in terror. Sickly yellow moonlight, deep green-black stalks."),
    ('NF-025', 'scarecrow-sentinel', 'Scarecrow Sentinel', 'COMIC',
     "A scarecrow with a stitched burlap sack head and a wide stitched grin stands on a post in a field at the edge of the city, its head turned to follow a "
     "passing 1950s sedan on the road. Crows circle overhead. City lights on the horizon. Yellow field, purple sky, heavy black ink."),
    ('NF-026', 'the-standing-stone', 'The Standing Stone', 'PAPERBACK',
     "An ancient carved standing stone in a weed-choked city vacant lot between brick tenements, its spiral carvings glowing faint green, red-ochre "
     "handprints smeared across it. A single sodium streetlight behind it, chain-link fence, broken glass. Dark, green glow and orange streetlight rim."),
    ('NF-027', 'the-wicker-colossus', 'The Wicker Colossus', 'PULP',
     "A giant wicker figure blazes on a hilltop at night, dark silhouettes trapped inside its chest. Robed villagers in a ring below chant with raised "
     "arms. Roaring orange flames and showers of sparks against a black sky, faces lit hot orange."),
    ('NF-028', 'blood-barley', 'Blood Barley', 'COMIC',
     "A field of barley whose grain heads are deep red and drip crimson onto dark soil. A smiling farmer in a straw hat and overalls harvests it with a "
     "scythe under a gory red sunset, his smile far too wide. Flat reds and yellows, halftone sky."),
    ('NF-029', 'mandrake-patch', 'Mandrake Patch', 'PAPERBACK',
     "Extreme close-up at night: a gloved hand pulls a mandrake root out of dark wet soil. The root is shaped like a tiny screaming human with arms and "
     "legs. Moonlight, dew drops, crumbs of earth, glossy highlights, black background."),
    ('NF-030', 'rite-of-the-first-furrow', 'Rite of the First Furrow', 'PULP',
     "A robed, bearded man drags an old wooden plough through a moonlit field by a rope over his shoulders. The furrow behind him glows faint green. A "
     "garlanded goat waits at the field's edge beside hooded watchers with torches. Moonlit blue and torch orange."),
    ('NF-031', 'the-reaping-hymn', 'The Reaping Hymn', 'COMIC',
     "A congregation in straw masks sings in a candlelit wooden chapel piled with corn sheaves, mouths stretched wide open. Above them, a dark shape "
     "with long limbs crouches in the rafters, unseen. Yellow candlelight and solid black, halftone dots on the masks."),
    ('NF-032', 'fallow-rest', 'Fallow Rest', 'PAPERBACK',
     "A bare winter field under frost at dawn. A dead tree is hung with offerings (corn dolls, ribbons, small bones). The frozen earth in the foreground "
     "bulges subtly, as if something huge breathes beneath it. Cold blue dawn, pale pink horizon, crisp frost highlights."),
    ('NF-033', 'he-who-wears-the-hill', 'He Who Wears the Hill', 'PULP + PAPERBACK',
     "An enormous horned god rises out of a green hill: its body is earth, roots and standing stones, its antlers like ancient oaks, its eyes two glowing "
     "pits. Tiny villagers lie prostrate below; storms of birds wheel around it. Apocalyptic gold and green sky, lightning."),
    # ---- Zombie Horde
    ('NF-034', 'patient-zero', 'Patient Zero, the First Mouth', 'PAPERBACK',
     "A man in a torn hospital gown bursts from leather restraints on a steel gurney inside a flickering black-site laboratory. His skin is grey and "
     "cracked, his mouth stretched impossibly wide. Red warning lights spin, broken glass hangs in the air, a scientist's clipboard falls. Red light, deep black."),
    ('NF-035', 'fresh-turned', 'Fresh Turned', 'COMIC',
     "A newly turned office worker in a loosened tie and shirtsleeves lurches out from between rows of 1950s typewriter desks, one eye clouded white, a bite "
     "mark on his forearm. Secretaries in cat-eye glasses scream and scatter papers. Motion lines, green and purple flats."),
    ('NF-036', 'hazmat-shambler', 'Hazmat Shambler', 'PAPERBACK',
     "A zombie in a torn yellow hazmat suit stumbles down a decontamination corridor, its rotting face pressed against a cracked visor fogged from inside. "
     "Red emergency light, wet floor reflections, hazard stripes, black shadows."),
    ('NF-037', 'sprinter', 'Sprinter', 'COMIC',
     "A sinewy zombie sprints on all fours down a night street, jaw unhinged, while a man in a 1950s overcoat and fedora runs in terror, glancing back "
     "over his shoulder. Extreme speed lines, lurid green and black, a streetlamp."),
    ('NF-038', 'bloated-carrier', 'Bloated Carrier', 'PAPERBACK',
     "A grotesquely swollen zombie in a 1970s mail carrier's uniform, skin taut and green-veined, staggers under a lone streetlight on an empty suburban "
     "street, leaking a sickly green mist. Flies swarm. Green glow, black night, wet asphalt highlights."),
    ('NF-039', 'crawler-swarm', 'Crawler Swarm', 'COMIC',
     "Dozens of legless zombies drag themselves out of a storm drain and across wet asphalt toward the viewer, clawed hands reaching out of the panel. "
     "Green and black with halftone, rain streaks, extreme foreshortening."),
    ('NF-040', 'subject-12-lockjaw', 'Subject 12, "Lockjaw"', 'PULP',
     "A hulking mutated zombie with a steel jaw brace half torn away and a broken chain on its wrist smashes through a laboratory wall in a burst of "
     "bricks while scientists in white coats flee. Chalkboard formulas and bubbling flasks. Hot red and yellow light."),
    ('NF-041', 'the-amalgam', 'The Amalgam', 'PAPERBACK',
     "A towering mass of fused bodies forms one creature with many arms and faces, dragging itself through a flooded subway tunnel. A single train "
     "headlight cuts through the dark and mist, reflecting in black water. Mostly black, cold white light, faint green rim."),
    ('NF-042', 'exposed-ribcage-maw', 'Exposed Ribcage Maw', 'COMIC',
     "A zombie whose chest has split open into a second mouth of ribs like teeth lunges at a 1950s soldier in a steel helmet. A small anatomical-diagram "
     "inset sits in one corner like a medical textbook illustration (no labels). Purple and green, heavy blacks."),
    ('NF-043', 'chitin-plating', 'Chitin Plating', 'PAPERBACK',
     "Macro detail: a zombie forearm covered in glossy black insect-like armor plates deflects a red fire axe in a shower of sparks. Glossy highlights on "
     "the chitin, black background, orange sparks."),
    ('NF-044', 'tendril-lash', 'Tendril Lash', 'PULP',
     "A zombie whose arms have become long writhing tendrils whips them across the gap between two rooftops to snatch a fleeing man in a 1930s suit and "
     "hat. Water towers, a lurid green night sky, a full moon."),
    ('NF-045', 'lazarus-7', 'LAZARUS-7', 'COMIC',
     "A gloved scientist in thick goggles raises a glowing green vial marked with a biohazard symbol; behind him the corpse on the steel slab opens its "
     "eyes. Laboratory of coils and tubes, green glow in flat color, heavy black shadows."),
    ('NF-046', 'vector-b', 'VECTOR-B (Airborne)', 'PAPERBACK',
     "Green mist rolls down a suburban street at night from a crashed military truck. Porch lights flicker, a silhouette collapses on a front lawn, a "
     "station wagon in a driveway. Green glow, amber porch lights, black night."),
    ('NF-047', 'containment-breach', 'Containment Breach', 'PULP',
     "Zombies pour through a shattered steel blast door painted with warning stripes while a soldier in the foreground fires a tommy gun. Red alarm "
     "lights, smoke, sparks, a melodramatic low angle."),
    ('NF-048', 'feeding-frenzy', 'Feeding Frenzy', 'COMIC',
     "A heap of zombies swarms over a toppled 1950s city bus, clawing at the windows, terrified passengers pressed against the glass inside. Extreme "
     "close-ups of rotting faces, lurid green and red flats, heavy black."),
    ('NF-049', 'cleanup-crew-lost', 'Cleanup Crew Lost', 'PAPERBACK',
     "A blood-smeared unmarked government van at night with its rear doors open, an empty hazmat suit hanging from one door, a dropped flashlight on the "
     "ground lighting footprints that lead off into the dark woods. Flashlight beam, red tail lights, black."),
    # ---- Slasher Killers
    ('NF-050', 'old-hollow', 'Old Hollow, the Story Told at Campfires', 'PAPERBACK',
     "Teenagers in 1980s camp clothes sit around a campfire in the woods; one holds a flashlight under his chin telling a story. The smoke rising above "
     "them forms a huge shadowy face with hollow black eyes looking down. Deep blue night, orange firelight on faces."),
    ('NF-051', 'the-groundskeeper', 'The Groundskeeper', 'PAPERBACK',
     "A towering, silent man in grimy overalls and a cracked white porcelain doll mask holds a rusted rake among fog-shrouded tombstones. A lit shed "
     "window glows behind him. Fog, cold blue moonlight, warm window light, black shadows."),
    ('NF-052', 'mister-lullaby', 'Mister Lullaby', 'COMIC',
     "A thin, smiling man in a striped nightcap and old-fashioned pyjamas, whose fingers end in long sewing needles, leans over a sleeping girl's bed. "
     "The bedroom stretches and warps into a dream behind him. Purple and lime flats, halftone, heavy black."),
    ('NF-053', 'the-hook-handed-man', 'The Hook-Handed Man', 'PULP',
     "A shadowy figure in a long raincoat with a gleaming steel hook for a hand rises behind a parked 1930s convertible on a lovers' lane; the couple "
     "inside is unaware. Full moon, deep ultramarine night, the hook catching hot light."),
    ('NF-054', 'the-caller', 'The Caller', 'PAPERBACK',
     "A rotary phone rings on the kitchen wall of a dark late-1970s suburban house, its coiled cord pulled taut toward the doorway. A silhouette stands on "
     "the stairs above. Snow falls outside the window. Cold blue, one warm lamp."),
    ('NF-055', 'rusted-machete', 'Rusted Machete', 'COMIC',
     "A rusted machete driven into a wooden dock post beside a misty lake, a summer-camp sign hanging crooked behind it, a single drip running down the "
     "blade. Flat greens and browns, halftone mist."),
    ('NF-056', 'chainsaw', 'Chainsaw', 'PULP',
     "A masked figure raises a roaring chainsaw overhead in a moonlit farmhouse yard, exhaust and sparks flying, while a victim scrambles away in the "
     "foreground. Intense red and black, theatrical moonlight."),
    ('NF-057', 'garden-shears', 'Garden Shears', 'PAPERBACK',
     "A gloved hand holds garden shears open in a dark greenhouse; rose petals and a single drop of red fall; a frightened face is reflected in the "
     "polished blades. Glossy metal highlights, deep black."),
    ('NF-058', 'bear-trap', 'Bear Trap', 'COMIC',
     "Extreme close-up: a bear trap snaps shut in fallen leaves inches from a canvas sneaker, caught in a camper's flashlight beam. Yellow and black, "
     "motion lines on the jaws."),
    ('NF-059', 'the-basement-door', 'The Basement Door', 'PAPERBACK',
     "A half-open basement door at the end of a dark hallway, a bare bulb swinging above, wooden stairs vanishing into blackness, two eyes catching the "
     "light at the bottom. Mostly black, one warm bulb."),
    ('NF-060', 'just-the-cat', 'Just the Cat', 'COMIC',
     "A black cat leaps out of a kitchen cupboard at a screaming babysitter in a 1950s kitchen, pots and pans flying, over-the-top expressions. Played "
     "for a jump-scare laugh. Bright flats, motion lines."),
    ('NF-061', 'dont-go-in-there', "Don't Go in There", 'PULP',
     "Seen from inside a dark room: a young woman in a 1930s nightgown, candle in hand, reaches for the handle of the door, red light leaking around "
     "its edges onto her face. Melodramatic, candlelight and hot red."),
    ('NF-062', 'the-phone-call', 'The Phone Call', 'COMIC',
     "A split panel: on one side a teenage girl in a 1950s ponytail grips a phone receiver in terror; on the other, across the street, a dark figure in a "
     "phone booth watches her lit window. Yellow window light, deep blue night."),
    ('NF-063', 'its-never-over', "It's Never Over", 'PAPERBACK',
     "A hand bursts out of a still lake at dawn beside a drifting canoe where an exhausted survivor sleeps. Mist on the water, pale pink sky, glossy "
     "water highlights, dark treeline."),
    ('NF-064', 'the-party', 'The Party', 'PAPERBACK',
     "A wild 1980s house party: teens dancing among streamers and a punch bowl in a lit suburban living room. In the dark upstairs window above them, a "
     "masked figure watches. Party colors against the black night. (The GDD lists PULP; a 1980s party reads best as an 80s paperback.)"),
    ('NF-065', 'final-scream', 'Final Scream', 'PAPERBACK',
     "Extreme close-up of a woman's face mid-scream; her wide eye reflects the silhouette of a masked killer raising a blade. Red and black, glossy tears, "
     "sharp highlights."),
    # ---- Devil's Own
    ('NF-066', 'augustin-vale', 'Augustin Vale, Ambassador of the Morning Star Society', 'PULP',
     "A suave silver-haired diplomat in a white dinner jacket raises a champagne flute on a gala balcony above a city of domes at night. His shadow on the "
     "wall behind him is horned. Fiery orange sky, theatrical uplight."),
    ('NF-067', 'margaret-wells', 'Margaret Wells, the Expectant Mother', 'PAPERBACK',
     "A pale, pregnant young woman with a short 1960s pixie cut, in a pale nightgown, stands in a gloomy apartment hallway with one hand on her belly. The "
     "neighbors' doors are cracked open with watching eyes behind them. Dim yellow hallway light, deep shadows."),
    ('NF-068', 'sister-abigail', 'Sister Abigail, the Chosen', 'PULP',
     "A young nun kneels before an altar of black candles, her habit lit red from below, while a goat-headed shadow towers on the wall behind her. "
     "Theatrical red and black."),
    ('NF-069', 'doting-neighbors', 'Doting Neighbors', 'COMIC',
     "An elderly couple in cardigans smile far too widely in an apartment doorway, offering a steaming mug of herbal tonic; their eyes are solid black, "
     "and a small pentagram pendant hangs on her necklace. Sickly purple flats."),
    ('NF-070', 'the-governess', 'The Governess', 'PAPERBACK',
     "A severe nanny in a black dress pushes an ornate black pram across a foggy estate lawn, a huge black dog at her side; both stare straight at the "
     "viewer. Grey morning light, fog, dark trees."),
    ('NF-071', 'the-black-priest', 'The Black Priest', 'PULP',
     "A priest in black vestments preaches from a pulpit to a candlelit congregation of hooded figures; a stained-glass window behind him shows a demon's "
     "face. Candle orange, deep violet."),
    ('NF-072', 'hellhound', 'Hellhound', 'COMIC',
     "A massive black dog with glowing red eyes and smoke pouring from its jaws leaps over a cemetery wall. Red and black flats, motion lines."),
    ('NF-073', 'the-possessed-girl', 'The Possessed Girl', 'PAPERBACK',
     "A girl in a white nightgown levitates above her bed in a frost-covered bedroom, eyes rolled back; a priest's silhouette stands in the lit doorway. "
     "Cold blue and sickly green, breath fog."),
    ('NF-074', 'azrimoth', 'Azrimoth, Duke Below', 'PULP',
     "A colossal winged demon with ram's horns and molten cracks across obsidian skin rises out of a burning city street as cultists bow before it. "
     "Firestorm sky, embers."),
    ('NF-075', 'the-jackals-birthmark', "The Jackal's Birthmark", 'COMIC',
     "Close-up of a nurse's horrified face as she parts a baby's hair to reveal a strange dark birthmark, in a hospital nursery. Pale green walls, sweat drops."),
    ('NF-076', 'ravens-on-the-steeple', 'Ravens on the Steeple', 'PAPERBACK',
     "Hundreds of ravens line a church steeple at dusk under a red sky; a lone priest looks up at them from the steps below. Red sky, black birds."),
    ('NF-077', 'tithe-of-souls', 'Tithe of Souls', 'PULP',
     "Ghostly translucent people are drawn as streams of light into an ornate golden chalice held by a hooded figure. Swirling violet and orange."),
    ('NF-078', 'the-blood-moon', 'The Blood Moon', 'PAPERBACK',
     "A huge red moon over a city skyline of church spires, seen through a nursery window; an empty crib and a black mobile turning in the foreground. "
     "Red moonlight, deep black room."),
    ('NF-079', 'unclean-spirit', 'Unclean Spirit', 'COMIC',
     "A 1950s sheriff's face twists into a demonic grin as black smoke pours into his mouth; his partner backs away in horror. Green and purple flats."),
    ('NF-080', 'the-exorcism-fails', 'The Exorcism Fails', 'PULP',
     "A priest is hurled backward across a bedroom by a burst of red light, his crucifix shattering, while a monstrous shadow rises from the bed."),
    ('NF-081', 'the-crossroads-deal', 'The Crossroads Deal', 'PAPERBACK',
     "A man in a sharp white suit offers a fountain pen and a contract to a desperate guitarist at a dusty rural crossroads at midnight; his long shadow "
     "is horned. Moonlight, dust, one lantern."),
    ('NF-082', 'a-name-in-the-ledger', 'A Name in the Ledger', 'COMIC',
     "An enormous leather ledger lies open on a desk, a quill writing in red by itself; a businessman's horrified face is reflected in the inkwell. "
     "Brown and red flats, heavy blacks."),
    ('NF-083', 'the-child', 'The Child', 'PULP + PAPERBACK',
     "A swaddled infant in a black bassinet in a gothic chapel, robed figures kneeling in a ring around it, the baby's eyes faintly gold, a solar eclipse "
     "through the rose window. Awe and dread, nothing graphic."),
    # ---- Neutral
    ('NF-084', 'the-final-girl', 'The Final Girl', 'PAPERBACK',
     "A bloodied young woman in a torn sweater grips a kitchen knife, standing defiant in the doorway of a burning cabin at dawn, hair windswept. Heroic low angle."),
    ('NF-085', 'father-moreno', 'Father Moreno, Exorcist', 'PULP',
     "A weathered priest raises a crucifix and a Bible against a wall of black smoke full of clawed hands, his face lit gold with determination."),
    ('NF-086', 'professor-ida-kask', 'Professor Ida Kask, Occultist', 'COMIC',
     "A sharp-eyed woman professor in a tweed suit holds a magnifying glass and a wooden stake in an attic stacked with occult books; a vampire's shadow "
     "falls across the window. Flat browns and greens, heavy black."),
    ('NF-087', 'sheriff-dale-burke', 'Sheriff Dale Burke', 'PAPERBACK',
     "A tired small-town sheriff holds a pump shotgun beside his 1970s patrol car, its light bar washing red and blue across a foggy road. Wet asphalt, fog."),
    ('NF-088', 'neighborhood-watch', 'Neighborhood Watch', 'COMIC',
     "Three suburban dads in matching windbreakers with flashlights and baseball bats patrol a cul-de-sac, nervous, unaware of eyes watching from the bushes."),
    ('NF-089', 'pale-morning-light', 'Pale Morning Light', 'PULP',
     "Sunrise slices through venetian blinds onto a vampire who throws up an arm as his skin smokes and ignites. Golden light bars, deep shadows."),
    ('NF-090', 'molotov-cocktail', 'Molotov Cocktail', 'COMIC',
     "A hand hurls a flaming bottle into an alley crowded with monsters at the moment of explosion. Oranges and reds, action lines."),
    ('NF-091', 'expose-in-the-evening-herald', 'Exposé in the Evening Herald', 'PAPERBACK',
     "A newspaper press spins out a front page whose grainy photo shows a vampire in a boardroom; ink and paper fly; a reporter grins in triumph. No readable text."),
    ('NF-092', 'evacuation-order', 'Evacuation Order', 'PULP',
     "Crowds flee across a bridge with suitcases and children under sweeping searchlights while a dark shape looms over the city behind them."),
    ('NF-093', 'blackout', 'Blackout', 'COMIC',
     "A city block plunges into darkness, only monstrous eyes glowing in the windows, a lone man holding a candle in the street. Black and electric blue."),
    ('NF-094', 'silver-etched-revolver', 'Silver-Etched Revolver', 'PAPERBACK',
     "An antique revolver engraved with silver crosses and wolfsbane on a velvet cloth beside a row of silver bullets, candlelight glinting."),
    ('NF-095', 'the-black-grimoire', 'The Black Grimoire', 'PULP',
     "A cracked black leather book bound with a chain, glowing sigils lifting off its open pages in an attic study, a hand reaching toward it."),
    # ---- Tokens
    ('NF-T01', 'shambler', 'Shambler (token)', 'COMIC',
     "A shambling zombie in torn 1950s work clothes lurches toward the viewer under a streetlamp, arms outstretched, jaw slack. Green and purple flats."),
    ('NF-T02', 'mandrake', 'Mandrake (token)', 'PAPERBACK',
     "A small root creature shaped like a wizened human, with a leafy crown and a gaping screaming mouth, crawling out of dark soil in moonlight."),
]

DISTRICTS = [
    ('NF-096', 'old-town', 'Old Town',
     "A cobblestone street of narrow brick buildings with gas lamps at dusk, shoppers and a horse-drawn cart.",
     "The same street burned and silent, windows dark, pale ghostly figures standing in every doorway."),
    ('NF-097', 'the-docks', 'The Docks',
     "A bustling harbor with ferries, cranes and gulls at sunset.",
     "The same wharf abandoned in fog, a smuggler's lantern glowing, crates leaking something dark."),
    ('NF-098', 'financial-district', 'Financial District',
     "Art-deco skyscrapers and a columned bank under a bright sky, busy sidewalks.",
     "One black tower with glowing red windows looming over empty streets."),
    ('NF-099', 'st-agnes-hospital', 'St. Agnes Hospital',
     "A brick hospital with a lit cross on its roof and ambulances at the entrance.",
     "A morgue corridor of steel drawers, one sliding open by itself."),
    ('NF-100', 'holy-cross-cathedral', 'Holy Cross Cathedral',
     "A gothic cathedral at sunset with doves on the steps.",
     "The desecrated nave, pews overturned, red candles everywhere, the altar defaced."),
    ('NF-101', 'maple-hollow-suburbs', 'Maple Hollow Suburbs',
     "Tidy 1950s houses with picket fences, children on bicycles.",
     "The same cul-de-sac at night, every window dark, figures standing motionless on the lawns."),
    ('NF-102', 'whispering-pines-campground', 'Whispering Pines Campground',
     "A lakeside summer camp with canoes, cabins and a flagpole.",
     "A lovers' lane at night: a parked car with its door open, fog, something hanging from the door handle."),
    ('NF-103', 'the-subway', 'The Subway',
     "A gleaming art-deco subway station full of commuters.",
     "The same station flooded and dark, dozens of eyes glowing in the tunnel."),
]

EXTRAS = [
    ('back', 'back', 'Card back', 'PULP + COMIC',
     "A symmetrical city skyline silhouette under a huge blood moon, bats forming a ring around the moon, deep red and black, with empty dark space at the "
     "top for the NIGHTFALL logo (leave it empty, add no lettering).", 'card'),
    ('pack', 'pack-blood-dawn', 'Blood Dawn booster pack', 'PULP',
     "A blood-red dawn breaking over a city skyline of towers and spires; silhouettes of a vampire, a scarecrow, a shambling zombie, a masked killer and a "
     "horned shadow stand on a rooftop in the foreground, black against the red sun. Leave the upper third calm for a logo (no lettering).", 'card'),
]

def style_of(code):
    return HYBRIDS[code] if '+' in code else STYLES[code]

def full(code, scene, fmt):
    s = style_of(code)
    return f"{s['style']}\n\nSCENE: {scene}\n\n{fmt}\n\nAVOID: {s['avoid']}."

items = []
for num, cid, name, code, scene in CARDS:
    items.append({'num': num, 'id': cid, 'name': name, 'style': code, 'styleName': style_of(code)['name'], 'scene': scene,
                  'prompt': full(code, scene, FORMAT_CARD), 'file': f'{num}.png'})
for num, cid, name, living, fallen in DISTRICTS:
    items.append({'num': num, 'id': cid, 'name': f'{name} (Living side)', 'style': 'LINEN', 'styleName': STYLES['LINEN']['name'], 'scene': living,
                  'prompt': full('LINEN', living, FORMAT_WIDE), 'file': f'{num}.png'})
    items.append({'num': num + 'F', 'id': cid + '-fallen', 'name': f'{name} (Fallen side)', 'style': 'PULP', 'styleName': STYLES['PULP']['name'],
                  'scene': fallen + ' Same camera angle as the Living side postcard, so flipping the card reads as before and after.',
                  'prompt': full('PULP', fallen + ' Same camera angle as the Living side, so flipping the card reads as before and after.', FORMAT_WIDE),
                  'file': f'{cid}-fallen.png'})
for num, cid, name, code, scene, _ in EXTRAS:
    items.append({'num': num, 'id': cid, 'name': name, 'style': code, 'styleName': style_of(code)['name'], 'scene': scene,
                  'prompt': full(code, scene, FORMAT_CARD), 'file': f'{cid}.png'})

LOCK = {k: (f"For this whole conversation, make every image in ONE fixed style, described below. I will send scenes one at a time; for each, "
            f"make one image in exactly this style. Never drift toward a modern digital painting.\n\n{v['style']}\n\n{FORMAT_CARD}\n\n"
            f"AVOID in every image: {v['avoid']}.\n\nReply \"Ready\" and wait for the first scene.") for k, v in STYLES.items() if k != 'LINEN'}
FIXES = {
    'PULP': "Too clean and digital. Repaint it as a real 1930s oil painting on canvas board: thick visible brushstrokes, impasto, rougher edges, fewer details, stronger red/yellow/blue, heavier black shadows, a yellowed varnish tone. Same scene.",
    'COMIC': "This still looks like a digital painting. Redo it as a real printed 1952 comic panel: thick black brush-ink outlines and hatching, NO painted shading or gradients, only flat color fills with visible halftone dots, slightly misaligned color plates, on yellowed newsprint. Same scene.",
    'PAPERBACK': "Too modern. Make it look like a 1980s paperback cover painting: hand-painted realism with airbrushed glows, much darker overall (mostly black), one light source with a strong colored rim light, glossy highlights, slight print grain and faded warm colors. Same scene.",
}
out = {'styles': {k: {'name': v['name'], 'style': v['style'], 'avoid': v['avoid']} for k, v in STYLES.items()}, 'lock': LOCK, 'fixes': FIXES,
       'formatCard': FORMAT_CARD, 'formatWide': FORMAT_WIDE, 'items': items}
json.dump(out, open(os.path.join(HERE, 'art_prompts.json'), 'w'), indent=1, ensure_ascii=False)

md = ['# NIGHTFALL art prompts (NF-010 onward)', '',
      'Generated by `tools/nightfall/art_prompts.py`. Each prompt is self-contained: style (the physical artifact), scene, format and what to avoid.', '',
      '## Tips for ChatGPT', '',
      '- Use one chat per style. Paste the style-lock message first, then each full prompt (or just its SCENE).',
      "- Attach an approved card as a reference: \"Use the attached image only as a reference for medium, brushwork, printing and paper — not for the subject.\" NF-001 is the paperback reference, NF-002 the comic reference.",
      '- If it drifts toward a digital painting, send the matching fix message below.',
      '- Ask for 1024 x 1536 (portrait). Name each file by its number (e.g. NF-010.png) when you send it back.', '']
for k in ('PULP', 'COMIC', 'PAPERBACK'):
    md += [f'## Style lock: {STYLES[k]["name"]}', '', '```', LOCK[k], '```', '', f'Fix: {FIXES[k]}', '']
md += ['## Prompts', '']
for it in items:
    md += [f'### {it["num"]} · {it["name"]} · {it["styleName"]}', '', '```', it['prompt'], '```', '']
open(os.path.join(ROOT, 'docs', 'nightfall-art-prompts.md'), 'w').write('\n'.join(md))
print(f'{len(items)} prompts written')
