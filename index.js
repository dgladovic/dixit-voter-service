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

    socket.on('joinSession',(message)=>{
        let selectedPlayer = JSON.parse(message);
        let newPlayer = new Player(selectedPlayer.name,socket.id,selectedPlayer.score);
        let playChecker = players.filter((player) => player.socketId === newPlayer.socketId);
        if(playChecker.length <= 0){
            players.push(newPlayer);
            let newCard = new Card(cards.length,"",new Array(),socket.id);
            cards.push(newCard);
        }
        io.emit('cardList', JSON.stringify(cards));
    })

    socket.on('cardVote',(message)=>{
        let playerSelection = JSON.parse(message);
        let cardInd = cards.findIndex( (card) => card.id === parseInt(playerSelection.id,10));
        let chosenCard = cards[cardInd];
        let choosersArray = chosenCard.choosers;

        choserInd = choosersArray.findIndex( (chooser) => chooser.name === playerSelection.player);
        let playerReference = players.find((player) => player.name === playerSelection.player)
        if(choserInd === -1){   // ukoliko nije pronadjen index, to znaci da igrac glasa za ovu kartu
            choosersArray.push(playerReference);
            // potrebno je skinuti glasove sa ostalih karata ukoliko je glasao za njih
            cards.forEach((card,index) => {
                if(index !== cardInd){      //samo ako ta karta se ne poklapa sa vec glasanom skidanje glasova
                    let voterPosition = card.choosers.findIndex((chooser) => chooser.name === playerReference.name);
                    card.choosers.splice(voterPosition,1);
                }
            })
        }
        io.emit('message',JSON.stringify(cards));
    })

    socket.on('ownerVote',(message)=>{
        let playerSelection = JSON.parse(message);
        let cardInd = cards.findIndex( (card) => card.id === parseInt(playerSelection.id,10));
        let chosenCard = cards[cardInd];
        let playerReference = players.find((player) => player.name === playerSelection.player)
        chosenCard.owner = playerReference;
        io.emit('message',JSON.stringify(cards));
    })

    socket.on('votingResults',(voteStarter)=>{
        // get storyteller player from front-end message
        let playerReference = JSON.parse(voteStarter);
        let storyTeller = players.find((player) => player.name === playerReference.player);
        cards.forEach( (card,cardIndex) => {
            if(card.owner === storyTeller){ // ako je vlasnik karte pripovedac
                if(card.choosers.length === 0|| 
                card.choosers.length === cards.length){ // ukoliko niko nije glasaso za pripovedaca ili svi
                    players.forEach( (player) => player.score = player.score + 2);
                    storyTeller.score = storyTeller.score - 2;
                }
                else{
                    card.choosers.forEach((chooser) =>{
                        let cardChooserReference = players.find((player) => player.name === chooser.name);
                        cardChooserReference.score = cardChooserReference.score + 2;  //ovde treba da se u owners prosledjuju objekti i reference ka njima a ne vrednosti stringova
                    })
                }
            }
            else{ // ovde napisati logiku za racunanje poena za durge igr
                let cardOwner = card.owner;
                let cardOwnerReference = players.find((player) => player.name === cardOwner.name);
                card.choosers.forEach((e) => {
                    cardOwnerReference.score = cardOwnerReference.score + 1; 
                });
            }
        })
        io.emit('message',players);
    })

    socket.on('resetCards',()=>{
        cards.forEach((card) =>{
            card.choosers = new Array();
            card.owner = new Object();
        })
        io.emit('message',JSON.stringify(cards));
    })

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

