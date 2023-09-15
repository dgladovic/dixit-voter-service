const http = require('http');
// ovo je modul koristi express za create server, ali nama je potrebna ta server instanca
// za pokretanje web socketa i socket.io
const express = require('express');
const socketio = require('socket.io');

const app = express();
const PORT = 3000 || process.env.PORT;

const server = http.createServer(app);
const io = socketio(server,{
    cors:{
        origin: 'http://localhost:3001',
        methods: ['GET', 'POST'],
    }
});

let players = new Array();
let rooms = new Map();
let cards = new Array();

function Card(id,owner,choosers,socketId){
    this.id = id;
    this.owner = owner;
    this.choosers = choosers;
    this.socketId = socketId;
}

function Player(name,socketId,score){
    this.socketId = socketId;
    this.name = name;
    this.score = score;
}

function removePlayer(id){
    const index = cards.findIndex(card => card.socketId === id);
    if(index !== -1){
        return cards.splice(index,1);
    }
}


//Run when a client connects

io.on('connection',(socket)=>{
    console.log('New WS Connectionr...');

    io.emit('roomList', JSON.stringify(Array.from(rooms.values())));

    socket.on('joinRoom', (data) => {
        const { playerName, roomName } = JSON.parse(data);

        // Check if the room exists
        const room = rooms.get(roomName);

        if (room) {
            // Add the participant to the room
            socket.join(roomName);
            // ova linija se konektuje na tu sobu, kao podrute u soketima

            // Notify the participant that they successfully joined the room
            socket.emit('roomJoined', room);

            // Broadcast the updated room list to all connected clients

            // Join the session with player's information
            let selectedPlayer = {
                name: playerName,
                socketId: socket.id,
                score: 0,
            };
            // room.players.push(socket.id);
            let playChecker = room.players.filter((player) => player.socketId === socket.id);
            if (playChecker.length <= 0) {
                room.players.push(selectedPlayer);
                let newCard = new Card(room.cards.length, "", new Array(), socket.id);
                room.cards.push(newCard);
            }
            io.to(roomName).emit('cardList', JSON.stringify(room.cards));
        } else {
            // Notify the participant that the room does not exist
            socket.emit('roomNotFound');
        }
    });

    socket.on('createRoom',(message)=>{
        rooms.set(message,{
            players: new Array(),
            cards: new Array(),
            name: message
        });
        io.emit('roomList', JSON.stringify(Array.from(rooms.values())));
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
            // potrebno je skinuti glasove sa ostalih karata ukoliko je glasao za njih
            room.cards.forEach((card,index) => {
                if(index !== cardInd){      //samo ako ta karta se ne poklapa sa vec glasanom skidanje glasova
                    let voterPosition = card.choosers.findIndex((chooser) => chooser.name === playerReference.name);
                    card.choosers.splice(voterPosition,1);
                }
            })
        }
        io.to(room.name).emit('message',JSON.stringify(room.cards));
    })

    socket.on('ownerVote',(message)=>{
        let playerSelection = JSON.parse(message);
        const room = rooms.get(playerSelection.room);
        let cardInd = room.cards.findIndex( (card) => card.id === parseInt(playerSelection.id,10));
        let chosenCard = room.cards[cardInd];
        let playerReference = room.players.find((player) => player.name === playerSelection.player)
        chosenCard.owner = playerReference;
        io.to(room.name).emit('message',JSON.stringify(room.cards));
    })

    socket.on('votingResults',(voteStarter)=>{
        // get storyteller player from front-end message
        let playerReference = JSON.parse(voteStarter);
        const room = rooms.get(playerReference.room);
        let storyTeller = room.players.find((player) => player.name === playerReference.name);
        room.cards.forEach( (card,cardIndex) => {
            if(card.owner.name === storyTeller.name){ // ako je vlasnik karte pripovedac
                if(card.choosers.length === 0|| 
                card.choosers.length === room.cards.length){ // ukoliko niko nije glasaso za pripovedaca ili svi
                    room.players.forEach( (player) => player.score = player.score + 2);
                    storyTeller.score = storyTeller.score - 2;
                }
                else{
                    card.choosers.forEach((chooser) =>{
                        let cardChooserReference = room.players.find((player) => player.name === chooser.name);
                        cardChooserReference.score = cardChooserReference.score + 2;  //ovde treba da se u owners prosledjuju objekti i reference ka njima a ne vrednosti stringova
                    })
                }
            }
            else{ // ovde napisati logiku za racunanje poena za durge igr
                let cardOwner = card.owner;
                let cardOwnerReference = room.players.find((player) => player.name === cardOwner.name);
                if(cardOwner){
                    card.choosers.forEach((e) => {
                        cardOwnerReference.score = cardOwnerReference.score + 1; 
                    });
                }
            }
        })
        io.to(room.name).emit('messageRes',JSON.stringify(room.players));
    })

    socket.on('resetCards',(message)=>{
        const room = rooms.get(message);
        room.cards.forEach((card) =>{
            card.choosers = new Array();
            card.owner = new Object();
        })
        io.to(message).emit('message',JSON.stringify(room.cards));
    })

    // ovo jos uvek nije zavrseno sa rooms
    socket.on('disconnect',()=>{
        const user = removePlayer(socket.id);
        if(user){
            io.emit('message',JSON.stringify(cards));
        }
    })
});

server.listen(PORT, ()=>{
    console.log(`Server runnning on port: ${PORT}`);
});

