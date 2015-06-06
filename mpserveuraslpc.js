/* Serveur nodejs et javascript permettant de récupérer un timecode et un entier 
    définissant le débit en litre / mn.
    
    Un second serveur permet de renvoyer la page html montrant ce 
    męme débit.
    
	Tutorial interessant
	http://arminboss.de/blog/2013/tutorial-how-to-create-a-basic-chat-with-node-js/
	
	
    Auteur : Michel Person 
    25 avril 2015	creation
	14 mai 2015     logx.txt sur /mnt/freebox/aslpc/
	30 mai 2015     debut evolution avec heure deb et fin pour affichage
*/

var http = require('http');
var fs = require('fs');
var url = require("url");
var io = require('socket.io'); // Chargement de socket.io

var HOST = '192.168.1.50';
//var HOST = '127.0.0.1';  //localhost
var PORTVISU = 6970;
var PORTLOG = 6969;



var tLignesFichier=[]; // contiendra toutes les lignes recopiees de logx.txt
var tjsdata = [{}];    // contiendra toutes les lignes forme JSON
var bgo = 0; // <=  a revoir !

//var fdata = "/home/g092816/node/visuAJAX/logx.txt"; 
//var fdata = "./logx.txt"; 
var fdata = "/mnt/freebox/aslpc/logx.txt";

var DBG = 1;
var bready = 0;	//booleen 0 ou 1
var vgsocket;	
var premierefois=1;

//parametres de controle de visualisation
var OFFSET = 0; // Correspond a la quantite non vu en fin de tjsdata 
var N = 24;     // 24 points d'analyse
var iDEB;
var iFIN;
var iMAX;
var idebms;  // correspond a l'heure de debut affichage en millisecondes
var ifinms;  // correspond a l'heure de fin affichage en millisecondes

//====================================================================
// SERVEUR VISU
//     fonction retournant les données à la demande
//	
// fourniture des dernieres donnees. Retourne une chaine JSON sérialisée 
getData = function(){
	//console.log("---getdata---");
	var i;
	var tjsdataret = [];
	
	if(premierefois)
	{	
		console.log('premierefois = ON');
		lireFileData();
		iMAX = tjsdata.length - 1 ;
		if (iMAX < 1 ) iMAX = 0; 
		iFIN = iMAX ;
		iDEB = iFIN ;
		OFFSET == 0 ;
		idebms = tjsdata[iFIN - 24].x ;
		ifinms = tjsdata[iFIN].x      ;
		if (DBG) console.log('premierefois:'+ 'idebms:' + idebms + '  ifinms:' + ifinms);
		premierefois = 0;
	}
    iMAX = tjsdata.length - 1 ;  // avoir toujours la valeur max

	// Rechercher dans tsjdata la valeur du temps en ms correspondant a celle demandée par idebms et ifinms 
	while(tjsdata[iDEB].x > idebms)
	{ 
		iDEB-- ;
		if (iDEB <= 0) 	
		{
			iDEB = 0; //butée basse
			break;
		}
	} 
	while(tjsdata[iDEB].x < idebms)
	{
		iDEB++ ;	
		if (iDEB >= iMAX)
		{
			iDEB = iMAX; //butée haute
			break;
		} 
	} 

	if (iDEB > iMAX) iDEB = iMAX;
	

	while(tjsdata[iFIN].x > ifinms)
	{ 
		iFIN-- ;
		if (iFIN <= 0) 	
		{
			iFIN = 0; //butée basse
			break;
		}
	} 
	while(tjsdata[iFIN].x < ifinms)
	{
		iFIN++ ;	
		if (iFIN >= iMAX)
		{
			iFIN = iMAX; //butée haute
			break;
		} 
	} 

	if (iFIN > iMAX) iFIN = iMAX;

		
	if (DBG) console.log('DEB:'+iDEB +  '  FIN:'+iFIN);
	
	for( i=0, x = iDEB; x < iFIN ; i++, x++	)
	{   
		tjsdataret[i] =  tjsdata[x]  ;
		//if (DBG) console.log(tjsdataret[i]);
	}

    //if (DBG) console.log(tjsdataret);
	return JSON.stringify(tjsdataret); // version plus propre ou l'objet est converti en json ( []=> tableau, {}=>objet )
};



// callback appele a chaque requete
onRequest = function(request, response) {  
	// url de la requete effectuee par le navigateur
	var uri = url.parse(request.url).pathname;
	if (DBG) console.log(uri);
	 
	switch(uri) {
		// requete pour la page HTML client
		case '/':
		case '/client.html':
			fs.readFile(__dirname+'/client.html', function (err, html) {
				if (DBG) console.log("PWD:"+__dirname);
				if (err) {
					response.writeHeader(500, {"Content-Type": "text/plain"});  
					response.write(err);
					response.end();  
					throw err; 
				}       
					
				response.writeHeader(200, {"Content-Type": "text/html"});  
				response.write(html);  //renvoi de la page 'client.html'
				response.end();
                lireFileData();  
			}); 
			break;
		
			
		// requete qui correspond a la recuperation des donnees
		case '/data.json':
			response.writeHeader(200, {"Content-Type": "application/json"});  
		  
			if (DBG) console.log("/data.json demandee");
			var chaine = getData();
			//console.log(chaine);
			// fournir les donnees directement au format JSON
			response.write( chaine );  
			response.end();
			break;
/*		
		// requete visant a recuperer les valeurs N et FIN	
		case '/para':
			response.writeHeader(200, {"Content-Type": "application/json"});  
			console.log("/para demandee");
			vn   =  24;
			vfin =  tjsdata.length;
			response.end();
		break;			
*/
			
		// gestion des erreurs
		default:
			response.writeHeader(404, {"Content-Type": "text/html"});  
			response.write('404 ressource not found : '+uri);  
			response.end();  
			if (DBG) console.log('^^ not found ^^');
			break;
	}
	
};

// ATTENTION Ne se declenche que si le fichier est touché !!
fs.watch( fdata ,  function (curr, prev) {
    lireFileData();
});

//Mise a jour de tjsdata par infos du fichier logx.txt
lireFileData = function(){
	//console.log("fichier update");
	bgo  = 0 ;
	// Lecture fichier data
	fs.readFile( fdata , function(error, donnees) 
	{
		var tligne=[];
		var tmp;
		if (bgo == 0) 
		{ 
			if (error) 
			{
				handleError(404, response_content_type, response);
			} else  
			{
				tLignesFichier = donnees.toString().split('\n');
				tjsdata = [{}];
				for (i in tLignesFichier) {
					// pas le premier élément a REVOIR !!
					tligne = tLignesFichier[i].split(' ');
					//console.log(tligne);
						
					if ( tligne[0]  != '')
					{   
					    // si vide pas d'enregistrement
						tjsdata.push( {"x":   Date.parse( tligne[0]  ),  "y": parseInt( tligne[1], 10) });
					}
					//console.log( tjsdata[i] );
					//console.log(tjsdata[i].x , tjsdata[i].y );
				}
				if (DBG) console.log('fichier logx.txt lu :'+i+' lignes');
				bgo = 1;
			}
			//Avertir le client que le fichier json est pret pour l'affichage
			if (bready == 1)
			{
				if (DBG) console.log('RELOAD');
				vgsocket.emit('askReload');
			}
		}
	});
}

var app = http.createServer(onRequest);
app.listen(PORTVISU, HOST);

// Socket.IO écoute 
io = io.listen(app); 

// Quand un client se connecte, on le note dans la console ET
// on récupčre la variable socket via l'évčnement 'connection'
io.sockets.on('connection', function (socket) {
    if (DBG) console.log('Un client est connecte !');
	vgsocket = socket;
	bready = 1;
	
	// Quand le serveur reçoit un signal de type "message_to_server" du client    
	vgsocket.on('message_to_server', function(data) {
	    if (DBG) console.log('From Client N:' + data.sN +' OFFSET:'+ data.sOFFSET);//{ N : vN} avec msg=32 par ex.
		N   =  data.sN   ;        // ! N variable globale
        OFFSET =  data.sOFFSET ;  // OFFSET varialble globale
        vgsocket.emit('askReload');
	});
	// Quand le serveur reçoit un signal de type "message_to_server" du client    
	vgsocket.on('message_to_server', function(data) {
	    if (DBG) console.log('From Client sFLAG:' + data.sFLAG );//{ N : vN} avec msg=32 par ex.
	    switch(data.sFLAG) 
	    {
    		case 1:
    		 	idebms -= (3600 * 1000);  // moins 1 heure
        		if (idebms < tjsdata[1].x) idebms = tjsdata[1].x ;
        		break;
    		case 2:
        		idebms += (3600 * 1000);  // plus 1 heure
        		if (idebms > tjsdata[iMAX].x) idebms = tjsdata[iMAX-2].x ; //attention mettre ifinms
        		break;
        	case 3:
    			ifinms -= (3600 * 1000);  // moins 1 heure
        		if (ifinms < idebms) ifinms = idebms ;
        		break;
    		case 4:
        		ifinms += (3600 * 1000);  // plus 1 heure
        		if (ifinms > tjsdata[iMAX].x) ifinms = tjsdata[iMAX-2].x ; //attention mettre ifinms
        		break;	
    		default:
        		//default code block
		}  
		if (DBG) console.log('idebms:'+idebms +'  ifinms:'+ifinms);
		//N   =  data.sN   ;        // ! N variable globale
        //OFFSET =  data.sOFFSET ;  // OFFSET varialble globale
        //vgsocket.emit('askReload');
	});
});
console.log('Server listening on '+HOST+':'+PORTVISU);




//=======================================================================
//=======================================================================
// SERVEUR LOG
//
var net = require('net');

// Create a server instance, and chain the listen function to it
// The function passed to net.createServer() becomes the event handler for the 'connection' event
// The sock object the callback function receives UNIQUE for each connection
net.createServer(function(sock) {
    
    // We have a connection - a socket object is assigned to the connection automatically
    if (DBG) console.log('CONNECTED: ' + sock.remoteAddress +':'+ sock.remotePort);
    
    // Add a 'data' event handler to this instance of socket
    sock.on('data', function(data) {
        if (DBG) console.log('DATA ' + sock.remoteAddress + ': ' + data);
		
        // Write the data back to the socket, the client will receive it
        //  as data from the server
//        sock.write('You said "' + data + '"'); // a enlever plus tard
	
	if ( data == "date") 
	{	
		var now = new Date();
		sock.write(now.toLocaleString());
		if (DBG) console.log("Demande date recue...et date renvoye");
	}else
	{
	        fs.appendFile( fdata , data + '\n', function (err) { 
        	       // a remplir fonction de l'erreur...
        	});
	}
    });
    
    // Add a 'close' event handler to this instance of socket
    sock.on('close', function(data) {
        if (DBG) console.log('CLOSED: ' + sock.remoteAddress +' '+ sock.remotePort);
    });
}).listen(PORTLOG, HOST);
if (DBG) console.log('Server listening on ' + HOST +':'+ PORTLOG);

