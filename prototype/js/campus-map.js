/* North-up campus overview, drawn from the supplied BYU campus-map references.
   Coordinates are illustration units, not surveyed/GPS geometry. Building IDs
   stay aligned with data.js; background landmarks are orientation aids only.
   Keep floor plans separate: these are exterior footprints, not interior plans. */
const CAMPUS = { w: 900, h: 850 };

// Perimeter, label anchor and badge anchor for each selectable building.
const CAMPUS_FOOTPRINTS = {
  hbll: { d: 'M417 370H438V351H444V338H464V351H471V370H491V376H495V405H491V411H470V423H484V429H488V454H426V424H440V411H417Z', label: [455,393], badge: [491,368] },
  wsc:  { d: 'M553 358H577V355H591V360H615V355H624V361H650V367H659V428H663V435H653V442H633L630 446L624 442H616V458H529V462H518V405H540V398H550V391H545V383H554Z', label: [593,407], badge: [658,365] },
  jfsb: { d: 'M284 384H356V391Q363 412 363 425Q363 442 357 450V460H282V447H277V398H282V391H284Z M303 401V443H343V401Z', label: [323,422], badge: [359,385] },
  tnrb: { d: 'M181 222H219V225H225V221H270V251H224V254H219V251H181Z', label: [225,239], badge: [269,221] },
  tmcb: { d: 'M321 290H368V318H364V331H373V354H365V366H347V356H328V353H320V357H294V328H321V319H318V301H321Z', label: [338,337], badge: [370,291] },
  esc:  { d: 'M356 481H419V498H386V504H408V527Q417 534 412 543L408 547V573H355V550H367V529H355V487H356Z', label: [386,535], badge: [420,480] },
  jkb:  { d: 'M344 247H371V244H382V247H402V245H414V250H422V263H416V272H414V324H393V270H383V265H375V270H365V266H344Z', label: [380,255], badge: [420,247] },
  kmbl: { d: 'M314 489L319 485L331 498L328 503L344 519L330 533L326 544H313L309 534L297 521L301 517L296 512L310 498L307 495Z', label: [319,519], badge: [340,491] },
  mckb: { d: 'M266 490H280V549H284V574H267V570H258V560H266Z', label: [275,540], badge: [284,491], font: 10 },
  hrcb: { d: 'M431 480H447V477H457V480H475V495H456V522H437V505H431Z', label: [451,486], badge: [468,480], font: 11 },
  marb: { d: 'M435 552H449V549H459V552H474V581H468V587H447V584H435Z', label: [453,570], badge: [473,550], font: 11 },
  cb:   { d: 'M518 523H543V520H551V523H567V534H564V545H568V569H564V579H568V590H556V602H540V596H521V590H515V545H512V537H518Z', label: [543,556], badge: [565,523] },
  ctb:  { d: 'M622 477H661V482H670V499H638V513H652V521H637V533H621V518H615V488H622Z', label: [644,491], badge: [672,478], font: 11 },
  snlb: { d: 'M716 495H744V512H751V520H745V530H753V545H717V538H714V510H716Z', label: [734,522], badge: [752,496], font: 10 },
  jrcb: { d: 'M683 280H701V277H711V280H736V316H727V323H733V338H729V346H735V361Q734 376 724 377H708V320H696V316H681V288H683Z', label: [713,316], badge: [746,279] },
  jsb:  { d: 'M266 636H286V659H297V657H305V668H310V680H300V684H285V695H265V684H262V649H266Z', label: [284,667], badge: [306,639], font: 12 },
  bnsn: { d: 'M335 641V636Q335 623 347 623Q360 623 361 637V643H377V674H391V614H404V650H417V655H424V673H415V680H391V677H377V681H329V648H334Z', label: [352,660], badge: [420,641], font: 11 },
};

const CAMPUS_CONTEXT = [
  ['WWB', 'West View Building', 'M244 340H260L254 377L249 414H235L240 377Z', 247,376],
  ['RB', 'Richards Building', 'M131 291L208 301L198 376L188 376L180 451L137 446L140 405L112 400L117 347L126 347Z', 160,365],
  ['SFH', 'Smith Fieldhouse', 'M0 490H139V482H211L201 533H165V545H0Z', 104,516],
  ['MOA', 'Museum of Art', 'M511 196L526 184H550L561 195L573 195L578 222H548V231H516V221H503Z', 542,211],
  ['ARTS', 'Arts Building', 'M496 250H589V309H557V318H521V309H496Z', 543,281],
  ['MB', 'Monte L. Bean Life Science Museum', 'M779 350H831V359H859V401H823V408H774V378H765V360H779Z', 815,382],
  ['PPCH', 'Central Heating Plant', 'M641 520H672V550H665V560H650V540H638V531H641Z', 655,535],
  ['EB', 'Engineering Building', 'M513 606H555V610H573V615H594V637H575V641H513Z', 553,626],
  ['NICB', 'Nicholes Building', 'M369 580H402V615H389V637H363V604H369Z', 386,598],
  ['LSB', 'Life Sciences Building', 'M423 700H478V690H488V770H478V786H439V777H425Z', 453,738],
  ['BRMB', 'Brimhall Building', 'M215 609H254V635H235V644H217Z', 236,624],
  ['HGB', 'Heber J. Grant Building', 'M206 679H247V699H206Z', 226,693],
  ['MCDB', 'McDonald Building', 'M489 661H530V654H547L571 672H526V683H490Z', 519,674],
  ['HO', 'Hinckley Center', 'M276 91H293V124H302V174H290V151H273V111H276Z', 287,121],
  ['CANC', 'Cannon Center', 'M153 28H225L237 46L218 74H191L180 83L153 74Z', 194,58],
  ['TCB', 'Tennis Courts Building', 'M99 555H132V615H99Z', 116,582],
];

function campusBackdrop() {
  // Broad land-use areas only. No invented pedestrian routes, tree symbols,
  // parking stripes, field markings, or ornamental geometry.
  const greens = [
    // Northwest residential area and the lawns north/east of the arts district.
    'M0 0H187L205 54L162 113L117 163L76 190H0Z',
    'M345 0H868V244H804L769 222L696 204L660 230L614 245L588 184L512 162V64H391L371 110L348 183H321Z',
    // West athletic fields and the broad south-campus hillside.
    'M0 246H83V456H0Z',
    'M0 551H88V630H0Z',
    'M0 691H75L116 647L164 583L197 518L218 465L235 405L246 332L264 278L279 284L268 390L249 477L211 559L165 626L120 691L91 751L120 776L223 750L403 698L419 707L400 771L305 804L191 824H0Z',
    // Central quads: keep their actual gaps open between the building groups.
    'M429 272H476V327H429Z',
    'M503 333H550V351H503Z',
    'M561 333H613V349H561Z',
    'M301 402H344V443H301Z',
    'M296 555H350V624H296Z',
    'M427 530H480V549H427Z',
    'M487 482H506V643H487Z',
    'M517 482H564V517H517Z',
    'M427 606H478V682H427Z',
    'M305 632H324V690H305Z',
  ];
  return `<g class="campus-background" aria-hidden="true">
    <g class="campus-lawns">${greens.map(d => `<path class="campus-lawn" d="${d}"/>`).join('')}</g>
    <g class="campus-landmarks">${CAMPUS_CONTEXT.map(([code,name,d,x,y]) => `<g><title>${name}</title><path d="${d}"/><text x="${x}" y="${y}">${code}</text></g>`).join('')}</g>
    <g class="campus-context-labels"><text x="77" y="102">Helaman</text><text x="90" y="119">Halls</text><text x="745" y="99">Heritage</text><text x="753" y="116">Halls</text><text x="40" y="342">RB fields</text><text x="40" y="592">South field</text></g>
    <g class="campus-road-labels"><text x="246" y="86" transform="rotate(-31 246 86)">Cougar Boulevard</text><text x="274" y="369" transform="rotate(-79 274 369)">Campus Drive</text><text x="730" y="424">Campus Lane</text><text x="759" y="674">900 North</text><text x="716" y="258" transform="rotate(12 716 258)">Heritage Drive</text></g>
  </g>`;
}
