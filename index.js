const http = require('http');
// ovo je modul koristi express za create server, ali nama je potrebna ta server instanca
// za pokretanje web socketa i socket.io
const express = require('express');
const socketio = require('socket.io');
const crypto = require('crypto');
const { InMemorySessionStore } = require("./sessionStore");
const sessionStore = new InMemorySessionStore();

const app = express();
const PORT = 4000 || process.env.PORT;

const server = http.createServer(app);
const io = socketio(server,{
    cors:{
        origin: `${process.env.BACKEND_URL}`,
        methods: ['GET', 'POST'],
    }
});

let rooms = new Map();

function Card(id,owner,choosers,socketId){
    this.id = id;
    this.owner = owner;
    this.choosers = choosers;
    this.socketId = socketId;
}

function Player(name,socketId,score,voted){
    // name: playerName,
    // socketId: socket.id,
    // score: 0,
    // voted: false,
    // votedOwnership: false
}

function removePlayer(id,room){
    const cardIndex = room.cards.findIndex(card => card.socketId === id);
    const playerIndex = room.players.findIndex(player => player.socketId === id);
    if(cardIndex !== -1){
        return { 
            card: room.cards.splice(cardIndex,1),
            player: room.players.splice(playerIndex,1) 
        }
    }
}

function randomIntFromInterval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function getRoom(id){
    const allRooms = Array.from(rooms.values());
    for(let i = 0; i < allRooms.length; i++){
        let roomName = allRooms[i]; //naziv sobe
        let room = rooms.get(roomName.name); // dovuci sobu
        for(let j = 0; j < room.cards.length; j++){
            let card = room.cards[j];
            if(card.socketId === id){
                return room;
            }
        }
    }
}

io.use((socket, next) => {
    const sessionID = socket.handshake.auth.sessionID;
    if (sessionID) {
      // find existing session
      const session = sessionStore.findSession(sessionID);
      if (session) {
        socket.sessionID = sessionID;   // ovo je id- sesije, tj. kada udjemo u app
        socket.userID = session.userID; // ovo vide svi drugi ljudi
        socket.name = session.name;
        socket.userScore = session.userScore;
        socket.roomName = session.roomName;
        socket.color = session.color;
        return next();
      }
    }
    const name = socket.handshake.auth.name;
    if (!name) {
      return next(new Error("invalid username"));
    }
    socket.sessionID = crypto.randomUUID();
    socket.userID = crypto.randomUUID();
    socket.name = name;
    socket.userScore = 0;
    socket.roomName = '';
    socket.color = '';
    next();
  });

//Run when a client connects

io.on('connection',(socket)=>{
    console.log('New WS Connectionr...');

    socket.emit("session", {            // ovde saljemo za frontapp
        sessionID: socket.sessionID,    // id uredjaja - sesije
        userID: socket.userID,          // javni id playera
        userScore: socket.userScore,
        name: socket.name,
        roomName: socket.roomName,
        color: socket.color
    });

    io.emit('roomList', JSON.stringify(Array.from(rooms.values())));

    socket.on('joinRoom', (data) => {
        const { playerName, roomName, reconnect, color } = JSON.parse(data);
        // Check if the room exists
        const room = rooms.get(roomName);
        if (room) {
            socket.join(roomName);
            socket.emit('roomJoined', room);
            let selectedPlayer = {
                name: playerName,
                socketId: socket.userID,
                score: 0,
                voted: false,
                votedOwnership: false,
                color: color
            };
            let playChecker = room.players.filter((player) => player.name === playerName);
            if (playChecker.length <= 0 && !reconnect) {
                room.players.push(selectedPlayer);
                sessionStore.saveSession(socket.sessionID, {    //u privatnoj sesiji za uredjaj cuvamo
                    sessionID: socket.sessionID,
                    userID: socket.userID,                      
                    userScore: selectedPlayer.score,                 
                    name: socket.name,
                    roomName: roomName,
                    color: selectedPlayer.color                    
                });
                let newCard = new Card(room.cards.length, "", new Array(), socket.userID);
                room.cards.push(newCard);
            }
            if(reconnect === 'yes'){
                let selectedPlayer = {
                    name: socket.name,
                    socketId: socket.userID,
                    score: socket.userScore,
                    voted: false,
                    votedOwnership: false,
                    color: socket.color
                };
                let playChecker = room.players.filter((player) => player.name === playerName);
                if (playChecker.length <= 0) {
                    room.players.push(selectedPlayer);
                    sessionStore.saveSession(socket.sessionID, {    //u privatnoj sesiji za uredjaj cuvamo
                        sessionID: socket.sessionID,
                        userID: socket.userID,                      
                        userScore: socket.userScore,                 
                        name: socket.name,
                        roomName: roomName,
                        color: socket.color                    
                    });
                    let newCard = new Card(room.cards.length, "", new Array(), socket.userID);
                    room.cards.push(newCard);
                    room.cards.forEach((card,ind) => card.id = ind);

                    socket.emit('storyteller',JSON.stringify(room.storyTeller));
                }
            }
            io.to(roomName).emit('cardList', JSON.stringify(room.cards));
        }
    });

    socket.on('createRoom',(message)=>{
        rooms.set(message,{
            players: new Array(),
            cards: new Array(),
            name: message,
            storyTeller: new Object()
        });
        io.emit('roomList', JSON.stringify(Array.from(rooms.values())));
    })

    // this starts the game
    socket.on('startGame',(message)=>{
        const parsed = JSON.parse(message);
        const room = rooms.get(parsed.room);
        if(room){
            const maxNumber = room.players.length;
            const rndInt = randomIntFromInterval(1, maxNumber);
            const startingStoryteller = room.players[rndInt-1];
            room.storyTeller = startingStoryteller;
            io.to(room.name).emit('storyteller', JSON.stringify(startingStoryteller));
        }else{
            socket.emit('roomNotFound','reconnecting failed...');
        }
    })

    // get who is storyteller
    socket.on('getstoryteller',(message)=>{
        const parsed = JSON.parse(message);
        const room = rooms.get(parsed.room);
        const storyTellerRef = room.storyTeller;
        let newStoryTeller;

        let storyTellerInd = room.players.findIndex((player) => player.name === storyTellerRef.name);
        if(storyTellerInd === room.players.length - 1){ //znaci da je poslednji igrac bio storyTell
            newStoryTeller = room.players[0];
            room.storyTeller = newStoryTeller;
        }else{
            newStoryTeller = room.players[storyTellerInd + 1];
            room.storyTeller = newStoryTeller;
        }
        io.to(room.name).emit('storyteller', JSON.stringify(newStoryTeller));
    })

    socket.on('cardVote',(message)=>{
        let playerSelection = JSON.parse(message);
        
        const room = rooms.get(playerSelection.room);
        let cardInd = room.cards.findIndex( (card) => card.id === parseInt(playerSelection.id,10));
        let chosenCard = room.cards[cardInd];
        let choosersArray = chosenCard.choosers;

        choserInd = choosersArray.findIndex( (chooser) => chooser.name === playerSelection.player);
        let playerReference = room.players.find((player) => player.name === playerSelection.player)
        if(choserInd === -1){   // ukoliko nije pronadjen index, to znaci da igrac glasa za ovu kartu
            choosersArray.push(playerReference);
            playerReference.voted = true;
            // potrebno je skinuti glasove sa ostalih karata ukoliko je glasao za njih
            room.cards.forEach((card,index) => {
                if(index !== cardInd){      //samo ako ta karta se ne poklapa sa vec glasanom skidanje glasova
                    let voterPosition = card.choosers.findIndex((chooser) => chooser.name === playerReference.name);
                    card.choosers.splice(voterPosition,1);
                }
            })
        }
        io.to(room.name).emit('message',JSON.stringify(room.cards));
        // mozda ovde slati samo igrace koji glasaju a da se storyteller izbaci iz ovog niza

        let modifiedPlayers = [...room.players];
        let storyTellerInd = modifiedPlayers.findIndex((player) => player.name === room.storyTeller.name);
        modifiedPlayers.splice(storyTellerInd,1);
        io.to(room.name).emit('playerVoteStatus',JSON.stringify(modifiedPlayers));
    })

    socket.on('ownerVote',(message)=>{
        let playerSelection = JSON.parse(message);
        const room = rooms.get(playerSelection.room);
        let cardInd = room.cards.findIndex( (card) => card.id === parseInt(playerSelection.id,10));
        let chosenCard = room.cards[cardInd];
        let playerReference = room.players.find((player) => player.name === playerSelection.player)
        chosenCard.owner = playerReference;
        playerReference.votedOwnership = true;

        io.to(room.name).emit('message',JSON.stringify(room.cards));
        io.to(room.name).emit('playerOwnershipStatus',JSON.stringify(room.players));
    })

    socket.on('votingResults',(voteStarter)=>{
        // get storyteller player from front-end message
        let playerReference = JSON.parse(voteStarter);
        const room = rooms.get(playerReference.room);
        let storyTeller = room.players.find((player) => player.name === playerReference.name);
        room.cards.forEach( (card,cardIndex) => {
            if(card.owner.name === storyTeller.name){ // ako je vlasnik karte pripovedac
                if(card.choosers.length === 0|| 
                card.choosers.length === room.cards.length - 1){ // ukoliko niko nije glasaso za pripovedaca ili svi
                    room.players.forEach( (player) => player.score = player.score + 2);
                    storyTeller.score = storyTeller.score - 2;
                    console.log('tet1');
                }
                else{
                    card.choosers.forEach((chooser) =>{
                        let cardChooserReference = room.players.find((player) => player.name === chooser.name);
                        cardChooserReference.score = cardChooserReference.score + 2;  //ovde treba da se u owners prosledjuju objekti i reference ka njima a ne vrednosti stringova
                    })
                    storyTeller.score = storyTeller.score + 2;
                    console.log('tet2');
                }
            }
            else{ // ovde napisati logiku za racunanje poena za durge igr
                let cardOwner = card.owner;
                let cardOwnerReference = room.players.find((player) => player.name === cardOwner.name);
                if(cardOwner && cardOwnerReference){    // ova linija resava problem ako na karti ne postoji owner, ali to je nemougc scenario, nego dvoje ljudi greskom
                    card.choosers.forEach((e) => {      // glasaju za istu kartu kao vlasnici, ovo treba da se error checkuje
                        cardOwnerReference.score = cardOwnerReference.score + 1;
                    console.log('tet3');
                    });
                }
                // ukoliko nema cardOwnera, onda treba da se napravi novi message
                // koji ce da kaze da za ovu kartu nema vlasnika, i da on treba da glasa za nju
            }
        })
        console.log(room.players,'tet4');
        let mesResObj = {
            players: room.players,
            roomName: room.name
        }
        io.to(room.name).emit('scoreUpdate',JSON.stringify(mesResObj));
    })

    socket.on('resetCards',(message)=>{
        const room = rooms.get(message);
        room.cards.forEach((card) =>{
            card.choosers = new Array();
            card.owner = new Object();
        })
        room.players.forEach((player)=>{
            player.voted = false;
            player.votedOwnership = false;
        });
        io.to(message).emit('message',JSON.stringify(room.cards));
        io.to(message).emit('playerVoteStatus',JSON.stringify(room.players));
        io.to(message).emit('playerOwnershipStatus',JSON.stringify(room.players));
    })

    socket.on('updateSession', (message) => {
        const receivedSession = JSON.parse(message);
        const session = sessionStore.findSession(socket.sessionID);
        if (session) {
            sessionStore.saveSession(socket.sessionID, {    //u privatnoj sesiji za uredjaj cuvamo
                sessionID: socket.sessionID,
                userID: socket.userID,
                userScore: receivedSession.userScore,
                name: socket.name,
                roomName: receivedSession.roomName,
                color: socket.color
            });
        }
    })

    // ovo jos uvek nije zavrseno sa rooms
    socket.on('disconnect',()=>{
        const room = getRoom(socket.userID);
        if(room){
            const {card, player} = removePlayer(socket.userID,room);
            if(card){
                io.to(room.name).emit('cardList',JSON.stringify(room.cards));
            }
            if(room.cards.length === 0){ //znaci da vise nema kartica u ovoj sobi, pa moze soba da se obrise
                rooms.delete(room.name);
                io.emit('roomList', JSON.stringify(Array.from(rooms.values())));
            }
        }
    })
});

server.listen(PORT, ()=>{
    console.log(`Server runnning on port: ${PORT}`);
});

