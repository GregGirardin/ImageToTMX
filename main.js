window.onload = mapGenInit;

let canvas;
let ctx;
let mapImage = new Image();
let tileImage = new Image();
let mapzoom = 1;

let DISP_WINDOW = 512; // Display window width

let tiles_per_row = 32;
let tileEdge = 32; // Assume square

let mapOffsetX = DISP_WINDOW / 2; // screen coordinates.
let mapOffsetY = DISP_WINDOW / 2;
let tileOffsetX = 0;
let tileOffsetY = 0;
let activeTile = undefined;
let tileMappings = {}; // RBG:TID
let tiles = [];
let tidMappingArray = undefined;
let showHit = false;
let hitRate = 0;

const TOLERANCE_STRICT = 1; // color must be exact match to tile
const TOLERANCE_MED = 2; // close match
const TOLERANCE_LOOSE = 3; // lose match

let mapping_tolerance = TOLERANCE_STRICT;

class mapcolor
{
  constructor( r, g, b )
  {
    this.r = r;
    this.g = g;
    this.b = b;
    this.rgb = ( r << 16 ) + ( g << 8 ) + b;
  }
}

class colorRange
{
  constructor( rgb, delta, tid )
  {
    this.rgb = rgb;
    this.r = rgb >> 16;
    this.g = ( rgb >> 8 ) & 0xff;
    this.b = rgb & 0xff;
    this.tid = tid;

    this.rmin = this.r - delta;
    if( this.rmin < 0 )
      this.rmin = 0;
    this.gmin = this.g - delta;
    if( this.gmin < 0 )
      this.gmin = 0;
    this.bmin = this.b - delta;
    if( this.bmin < 0 )
      this.bmin = 0;

    this.rmax = this.r + delta;
    if( this.rmax > 0xff )
      this.rmax = 0xff;
    this.gmax = this.g + delta;
    if( this.gmax > 0xff )
      this.gmax = 0xff;
    this.bmax = this.b + delta;
    if( this.bmax > 0xff )
      this.bmax = 0xff;
  }

  matchColor( r, g, b )
  {
    if( r < this.rmin || r > this.rmax )
      return false;
    if( g < this.gmin || g > this.gmax )
      return false;
    if( b < this.bmin || b > this.bmax )
      return false;
    return true;
  }
}

function mapGenInit()
{
  canvas = document.getElementById( "myCanvas" );
  ctx = canvas.getContext( "2d" );
  ctx.canvas.width = DISP_WINDOW * 2;
  ctx.canvas.height = DISP_WINDOW * 2;
  
  document.getElementById( 'openMapAction' ).addEventListener( 'change', openMapFile, false );
  document.getElementById( 'openTilesAction' ).addEventListener( 'change', openTileFile, false );
  document.getElementById( 'openMappingsAction' ).addEventListener( 'change', openMappingsFile, false );
  
  document.addEventListener( "keydown", keyDownHandler, false );
  mapImage.addEventListener( 'load', drawScreen );
  tileImage.addEventListener( 'load', tilesLoaded );
}

function tilesLoaded()
{
  tiles_per_row = tileImage.width / tileEdge;
  drawScreen();
}

function drawScreen()
{
  ctx.fillStyle = "black";
  ctx.fillRect( 0, 0, 1024, 1024 ); // this will be the UI's canvas

  // pixels in (mapImage pixels) above, below, left, right of point to show
  // fewer points if zoomed.
  // if zoom is 1, we want 1/2 of mapImage.with, so clicking in the center will show the whole thing
  // if zoom is 2 we want 1/4, etc.
  let zoomDistance = mapImage.width * .5 / mapzoom;

  // Show the zoomed portion of the map on the right

  // mapOffset are in screen coordinates, scale to mapImage coordinats
  let mapX = mapOffsetX * mapImage.width / DISP_WINDOW;
  let mapY = mapOffsetY * mapImage.height / DISP_WINDOW;

  ctx.drawImage( mapImage, mapX - zoomDistance, mapY - zoomDistance, zoomDistance * 2, zoomDistance * 2, 0, 0, DISP_WINDOW, DISP_WINDOW );

  if( showHit && tidMappingArray )
  {
    ctx.fillStyle = "black";

    const w = mapImage.width;
    const h = mapImage.height;
    const sfactor = mapImage.width / DISP_WINDOW;
    for( let y = 0;y < DISP_WINDOW;y++ )
      for( let x = 0;x < DISP_WINDOW;x++ )
      {
        // deterime the points in the tidMappingArray
        let xXlate = Math.floor( ( mapX - zoomDistance ) + ( x / DISP_WINDOW ) * ( zoomDistance * 2 ) );
        let yXlate = Math.floor( ( mapY - zoomDistance ) + ( y / DISP_WINDOW ) * ( zoomDistance * 2 ) );
        if( ( xXlate < w ) && ( yXlate < h ) && tidMappingArray[ yXlate * h + xXlate ] == 0 )
          ctx.fillRect( x, y, 1, 1 ); // overlay misses
      }
  }

  ctx.drawImage( tileImage, tileOffsetX, tileOffsetY, DISP_WINDOW, DISP_WINDOW, DISP_WINDOW, 0, DISP_WINDOW, DISP_WINDOW );

  // Separator
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo( DISP_WINDOW, 0 );
  ctx.lineTo( DISP_WINDOW, DISP_WINDOW );
  ctx.moveTo( 0, DISP_WINDOW );
  ctx.lineTo( DISP_WINDOW * 2, DISP_WINDOW );
  ctx.stroke();

  ctx.font = "22px Georgia";
  ctx.fillStyle = "white";

  ctx.fillText( "Hit Rate:" + ( Math.floor( hitRate * 10 ) / 10 ).toString(), 200, 530 );

  if( activeTile) 
    if( activeTile.tid )
    {
      ctx.fillText( "Active Tile:" + activeTile.tid.toString(), 10, 530 );
      ctx.drawImage( tileImage, activeTile.tileOffsetX, activeTile.tileOffsetY, tileEdge, tileEdge,
                    10, 550, tileEdge * 2, tileEdge * 2 );
      
      tileEditX = 10;

      for( key in activeTile.colors )
      {
        let obj = activeTile.colors[ key ];
        let fill = "#" + obj.r.toString( 16 ) + obj.g.toString( 16 ) + obj.b.toString( 16 );
        ctx.fillStyle = fill;

        ctx.fillRect( tileEditX, 700, 32, 32 ); // this will be the UI's canvas
        tileEditX += 40;
      }
    }
}

function keyDownHandler( param )
{
  const pointOffset = 100 / mapzoom;

  if( window.event.shiftKey )
    switch( param.key )
    {
      case "ArrowLeft":
        tileOffsetX -= DISP_WINDOW;
        if( tileOffsetX < 0 )
          tileOffsetX = 0;
        break;
      case "ArrowRight":
        if( tileImage.width > tileOffsetX + DISP_WINDOW )
          tileOffsetX += DISP_WINDOW;
        break;
      case "ArrowUp":
        tileOffsetY -= DISP_WINDOW;
        if( tileOffsetY < 0 )
        tileOffsetY = 0;
        break;
      case "ArrowDown":
        if( tileImage.height > tileOffsetY + DISP_WINDOW )
          tileOffsetY += DISP_WINDOW;
        break;
    }
  else
    switch( param.key )
    {
      case "ArrowLeft":mapOffsetX -= pointOffset; break;
      case "ArrowRight": mapOffsetX += pointOffset; break;
      case "ArrowUp": mapOffsetY -= pointOffset; break;
      case "ArrowDown": mapOffsetY += pointOffset; break;
    }

  switch( param.key )
  {
    case "Escape":
      activeTile = undefined; // delete any current entries.
      break;
    case 'm': openMapClick(); break;
    case 't': openTilesClick(); break;
    case '1':
      if( mapzoom == 1 )
      { // center
        mapOffsetX = DISP_WINDOW / 2;
        mapOffsetY = DISP_WINDOW / 2;
      }
      else
        mapzoom = 1;
      break;
    case 's':
      if( showHit )
        showHit = false;
      else
        showHit = true;
      break;
    case '2': mapzoom =  2; break;
    case '3': mapzoom =  4; break;
    case '4': mapzoom =  8; break;
    case '5': mapzoom = 16; break;
    case '6': mapzoom = 32; break;
    case '7': mapzoom = 64; break;
  }
  if( mapOffsetX < 0 )
    mapOffsetX = 0;
  if( mapOffsetX > DISP_WINDOW )
    mapOffsetX = DISP_WINDOW;
  if( mapOffsetY < 0 )
    mapOffsetY = 0;
  if( mapOffsetY > DISP_WINDOW )
    mapOffsetY = DISP_WINDOW;

  drawScreen();
}

function openMappingsClick() { document.getElementById( 'openMappingsAction' ).click(); }
function openMappingsFile( e )
{
  var file = e.target.files[ 0 ];
  if( !file )
    return;

  var reader = new FileReader();

  reader.onload = function( e )
  {
    tileMappings = JSON.parse(  e.target.result );
    drawScreen();
  }
  reader.readAsText(file);
}

// Save the file that maps colors to tiles
function saveMappingsFile()
{
  let mappingsFile = JSON.stringify( tileMappings, null, 2 );

  const a = document.createElement( 'a' );
  const file = new Blob( [ mappingsFile ], { type: 'text/plain' } );
  
  a.href = URL.createObjectURL( file );
  a.download = "mapping.json";
  a.click();

	URL.revokeObjectURL( a.href );
 }

 // Skeleton of a TMX json file.. need to make our mods to it then save.
 let mappingsObj =
  {
    "compressionlevel":-1,
    "height":11,
    "infinite":false,
    "layers":[
          {
            "data":[], // the map data goes in here.
            "height":11,
            "id":1,
            "name":"Tiles",
            "opacity":1,
            "type":"tilelayer",
            "visible":true,
            "width":11,
            "x":0,
            "y":0
          }],
    "nextlayerid":4,
    "nextobjectid":4,
    "orientation":"orthogonal",
    "renderorder":"right-down",
    "tiledversion":"1.10.2",
    "tileheight":32,
    "tilesets":[
          {
            "columns":32,
            "firstgid":1,
            "image":"",
            "imageheight":512,
            "imagewidth":1024,
            "margin":0,
            "name":"Tiles",
            "spacing":0,
            "tilecount":512,
            "tileheight":32,
            "tilewidth":32
          }],
    "tilewidth":32,
    "type":"map",
    "version":"1.10",
    "width":11
  };

function saveTMXFile()
{
  if( !tidMappingArray )
    return;

  mappingsObj.height = mapImage.height;
  mappingsObj.width = mapImage.width;
  mappingsObj.layers[ 0 ].height = mapImage.height;
  mappingsObj.layers[ 0 ].width = mapImage.width;
  mappingsObj.tileheight = tileEdge;
  mappingsObj.tilewidth = tileEdge;

  mappingsObj.tilesets[ 0.].columns = tileImage.width / tileEdge;
  mappingsObj.tilesets[ 0.].imageheight = tileImage.height;
  mappingsObj.tilesets[ 0.].imagewidth = tileImage.width;

  mappingsObj.tilesets[ 0.].tilecount = tileImage.height * tileImage.width / tileEdge / tileEdge;
  mappingsObj.tilesets[ 0.].tileheight = tileEdge;
  mappingsObj.tilesets[ 0.].tilewidth = tileEdge;
  mappingsObj.layers[ 0 ].data = tidMappingArray;

  let fileJSON = JSON.stringify( mappingsObj, null, 2 );

  const a = document.createElement( 'a' );
  const file = new Blob( [ fileJSON ], { type: 'text/plain' } );
  
  a.href = URL.createObjectURL( file );
  a.download = "map.json";
  a.click();

	URL.revokeObjectURL( a.href );
 }

function openMapClick() { document.getElementById( 'openMapAction' ).click(); }

function openMapFile( e )
{
  var input = e.target;
  var reader = new FileReader();
  reader.onload = function()
  {
    var dataURL = reader.result;
    mapImage.src = dataURL;
    drawScreen();
  };
  reader.readAsDataURL( input.files[ 0 ] );
}

function openTilesClick() { document.getElementById( 'openTilesAction' ).click(); }

function openTileFile( e )
{
  var input = e.target;
  var reader = new FileReader();
  reader.onload = function()
  {
    var dataURL = reader.result;
    tileImage.src = dataURL;
    drawScreen();
  };
  reader.readAsDataURL( input.files[ 0 ] );
  mappingsObj.tilesets[ 0.].image = input.files[ 0 ].name;
}

function generateTMX()
{
  if( !mapImage.width || !tileImage.width )
    return;

  const w = mapImage.width;
  const h = mapImage.height

  // create a temp canvas to put the full map on and get pixels from.
  let tmpCanvas = document.createElement( 'canvas' );
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  let tmpCtx = tmpCanvas.getContext( '2d' );
  tmpCtx.drawImage( mapImage, 0, 0, mapImage.width, mapImage.height );

  let color_range = undefined;
  // generate ranges rgb value +/- tolerance range 
  if( mapping_tolerance == TOLERANCE_MED )
    color_range = 8;
  else if( mapping_tolerance == TOLERANCE_LOOSE )
    color_range = 32;

  let rangeMappings = [];

  if( color_range )
    for( [ key, value ] of Object.entries( tileMappings ) )
      rangeMappings.push( new colorRange( key, color_range, value ) );

  tidMappingArray = new Array( w * h );
  // TBD bug when h > 1024???
  // console.log( "1 tidMappingArray L:", tidMappingArray.length ); // Debug
  let initialL = tidMappingArray.length;
  let hits = 0;
  for( let y = 0;y < h;y++ )
    for( let x = 0;x < w;x++ )
    {
      tidMappingArray[ y * h + x ] = 0;

      let pixel = tmpCtx.getImageData( x, y, 1, 1 );
      let pixelVal = new mapcolor( pixel.data[ 0 ], pixel.data[ 1 ], pixel.data[ 2 ] );
      // exact match?
      let val = tileMappings[ pixelVal.rgb ]
      if( val ) // exact mapping
      {
        hits++;
        tidMappingArray[ y * h + x ] = val; 
      }
      else // try approximate mapping.
        for( index = 0;index < rangeMappings.length;index++ )
          if( rangeMappings[ index ].matchColor( pixel.data[ 0 ], pixel.data[ 1 ], pixel.data[ 2 ] ) )
          {
            hits++;
            tidMappingArray[ y * h + x ] = rangeMappings[ index ].tid;
            break;
          }
    }
  //console.log( "2 tidMappingArray L:", tidMappingArray.length ); // Debug

  hitRate = hits * 100 / ( w * h );
  drawScreen();
}

function mapClick( event )
{
  if( ( event.offsetX > DISP_WINDOW ) && ( event.offsetY < DISP_WINDOW ) ) // click in tiles area 
  {
    activeTile = {};
    activeTile.tid = ( tileOffsetY / tileEdge ) * tiles_per_row + Math.floor( event.offsetY / tileEdge ) * tiles_per_row +
                       tileOffsetX / tileEdge + Math.floor( ( event.offsetX - DISP_WINDOW ) / tileEdge ) + 1; // First tid is 1.
    activeTile.colors = {}; // colors that will be mapped to this tile. key:Val rgb:mapcolor

    // fill in any existing enteries from the tileMappings
    for( [ key, value ] of Object.entries( tileMappings ) )
      if( value == activeTile.tid )
      {
        let r = ( key & 0xff0000 ) >> 16;
        let g = ( key & 0xff00 ) >> 8;
        let b = key & 0xff;
        let entry = new mapcolor( r, g, b );
        activeTile.colors[ entry.rgb ] = entry;
      }

    activeTile.tileOffsetX = tileOffsetX + event.offsetX - DISP_WINDOW;
    activeTile.tileOffsetX -= activeTile.tileOffsetX % tileEdge; // get to the top left pixel
    activeTile.tileOffsetY = tileOffsetY + event.offsetY;
    activeTile.tileOffsetY -= activeTile.tileOffsetY % tileEdge;
    // populate with any existing color mappings.
  }
  else if( ( event.offsetX < DISP_WINDOW ) && ( event.offsetY < DISP_WINDOW ) ) // map area, add this point to the activeTiles colors
  {
    if( activeTile )
    {
      let showing = showHit;

      if( showing )
      {
        // Temporarily redraw the screen without misses indicated in black since we get the pixels from the screen.
        showHit = false;
        drawScreen();
      }

      let pixel = ctx.getImageData( event.offsetX, event.offsetY, 1, 1 );
      let pixelVal = new mapcolor( pixel.data[ 0 ], pixel.data[ 1 ], pixel.data[ 2 ] );
    
      activeTile.colors[ pixelVal.rgb ] = pixelVal; // key is RBG value, value is a full mapcolor instance
      tileMappings[ pixelVal.rgb ] = activeTile.tid;

      if( showing )
        showHit = true;
    }
  }
  else if( event.offsetY > DISP_WINDOW ) // in the tile color map. Delete the color we clicked
    if( activeTile )
    {
      let pixel = ctx.getImageData( event.offsetX, event.offsetY, 1, 1 );
      let pixelVal = new mapcolor( pixel.data[ 0 ], pixel.data[ 1 ], pixel.data[ 2 ] );
      delete activeTile.colors[ pixelVal.rgb ];
      delete tileMappings[ pixelVal.rgb ];
    }

  drawScreen();
}

// assume 16,32, or 64
function toggleTileWidth()
{
  tileEdge *= 2;
  if( tileEdge > 64 )
    tileEdge = 16;

  document.getElementById( 'tileWidthButton' ).innerHTML = tileEdge.toString();
  tiles_per_row = tileImage.width / tileEdge;
}

function toggleMappingTolerance()
{
  if( mapping_tolerance == TOLERANCE_LOOSE )
    mapping_tolerance = TOLERANCE_STRICT;
  else
    mapping_tolerance++;

  let str;
  switch( mapping_tolerance )
  {
    case TOLERANCE_STRICT: str = "Strict"; break;
    case TOLERANCE_MED: str = "Medium"; break;
    case TOLERANCE_LOOSE: str = "Loose"; break;
  }

  document.getElementById( 'toggleToleranceButton' ).innerHTML = str;
  drawScreen();
}

function displayHelp()
{
  const instructionStrings =
  [
    "Choose the map image by clicking 'Open Map Image' or pressing 'm'. Choose the tile image by clicking 'Open Tiles' or pressing 't'",
    "Select the tile width 16,32 or 64.",
    "",
    "Select a tile by clicking it, deselect with Escape. Select colors that map to that tile by clicking in the map.",
    "Prune mapping colors by clicking on them in the mapping pane.",
    "Save these color to tile mappings with 'Save Mappings', load them with 'Open Mappings'.",
    "",
    "Test the mapping by clicking 'Generate'. Toggle showing the missed tiles by pressing 's'.",
    "If you don't need exact color mapping change 'Strict' to 'Med' or 'Loose'.",
    "",
    "Save the map as json using 'Save TMX'. This can be opened with Tiled.",
    "",
    "Navigate Map: Arrows, 1-7 to zoom, press 1 twice to center. Adjust Tile Map: Shift + Arrows."
  ];

  ctx.fillStyle = "black";
  ctx.font = "14px Arial";
  ctx.clearRect( 0, DISP_WINDOW, 2 * DISP_WINDOW, 2 * DISP_WINDOW );
  for( let index = 0;index < instructionStrings.length;index++ )
    ctx.fillText( instructionStrings[ index ], 20, DISP_WINDOW + 20 + index * 30 );
}