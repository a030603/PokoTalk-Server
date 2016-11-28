
var userId = str = document.getElementById("phpUserId").textContent.replace(/\s/g, "");
var sessionId = document.getElementById("phpSessionId").textContent.replace(/\s/g, "");
var groups;
var me;
var logined = false;
var port = 4000;
var server = io.connect('https://vps332892.ovh.net:4000');
var chatRoom = {
	groupId: null,
	members: {},
};

/* ------------------------	*/
/*			Event Listeners			*/
/* ------------------------	*/

window.addEventListener('load', function() {

	var controlDiv = document.getElementById('control');

	server.on('connect', function() {
		console.log('connected to server at port ' + port);
		reset();
		server.emit('login', {userId: userId});
	});
	server.on('reconnect', function() {
		console.log('reconnected to server');
		reset();
		server.emit('login', {userId: userId});
	});
	server.on('disconnect', function() {
		console.log('diconnected from server');
		logined = false;
	});
	server.on('error', function() {
		console.log('connection error');
	});
	server.on('login', function(data) {
		if (data.status == 'success') {

			server.emit('getPendingContactList');
			server.emit('getPendingGroupList');
			server.emit('getContactList');
			server.emit('getGroupList');

			//$('#loginStatus').text('status : logined');
			logined = true;

			// HTML forms
			$('#contactAddButton').unbind("click").bind("click", function() {
				server.emit('addContact', { email: $('#contactInput').val() });
				server.emit('getPendingContactList');
			});
			$('#createGroupButton').unbind("click").bind("click", function () {
				server.emit('addGroup', {name: $('#createGroupNameInput').val(), members: new Array(me['email'])});
				server.emit('getGroupList');
			});

			me = data.data;
		}
	});
	server.on('exitGroup', function(data) {
		if (data.status == 'success') {
			console.log('group exited');
		} else {
			console.log('failed to exit group');
		}
	});
	server.on('inviteGroupMembers', function(data) {
		if (data.status == 'success') {
			console.log('members invited');
		} else {
			console.log('failed to invite group members');
		}
	});
	server.on('addGroup', function(data) {
		if (data.status == 'success') {
			console.log('group added');
			server.emit('getGroupList');
			groups.push(data.group);
		} else {
			console.log('failed to add group');
		}
	});
	server.on('addContact', function(data) {
		if (data.status == 'success') {
			console.log('contact added');
		} else {
			console.log('failed to add contact');
		}
	});
	server.on('removeContact', function(data) {
		if (data.status == 'success') {
			console.log('contact removed');
		} else {
			console.log('failed to remove contact');
		}
	});
	server.on('newContact', function(data) {
		server.emit('getGroupList');
		server.emit('getContactList');
		server.emit('getPendingContactList');
	});
	server.on('contactDenied', function (data) {
		server.emit('getPendingContactList');
	});
	server.on('contactRemoved', function (data) {
		server.emit('getContactList');
	});
	server.on('newPendingContact', function(data) {
		server.emit('getPendingContactList');
	});
	server.on('getPendingContactList', function(data) {
		if (data.status == 'success') {
			var pcontacts = data.contacts;
			var pendingContactListDiv = document.getElementById("pending-contact-list");
			printContactList(pcontacts, pendingContactListDiv, true);
		} else {
			console.log("failed to get pending contact list");
		}
	});
	server.on('getContactList', function(data) {
		if (data.status == 'success') {
			var contacts = data.contacts;
			var contactListDiv = document.getElementById("contact-list");
			printContactList(contacts, contactListDiv, false);
		} else {
			console.log("failed to get contact list");
		}
	});
	server.on('getGroupList', function(data) {
		if (data.status == 'success') {
			groups = data.groups;
			var groupListDiv = document.getElementById("group-list");
			printGroupList(groups, groupListDiv, false);
		} else {
			console.log('failed to get group list');
		}
	});
	server.on('readMessage', function(data) {
		console.log('readMessage');
		console.log(data);
		if (data.status == 'success') {
			addOldMessages(data.messages);
		}
	});
	server.on('sendMessage', function(data) {
		console.log('sendMessage');
		console.log(data);
	});
	server.on('newMessage', function(data) {
		// if message was sent for the chat
		if (chatRoom.groupId == data.groupId) {
			//console.log(chatRoom.members);
			if (data.userId == me.userId) {
				addMyMessage(data.content, chatRoom.members[data.userId].nickname, new Date(), 0); // TODO
			}	else {
				if (data.location =! null){
					addLocation(data.location);
					console.log("diplay the location");
				}
				addMessage(data.content, chatRoom.members[data.userId].nickname, new Date(), data.importance);
			}
		} else {

			var str = data.content;
			if (chatRoom.members[data.userId] != undefined) {
				str = chatRoom.members[data.userId].nickname + " \n" + str;
			}
			notifyMessage(str);

			// else, it is a notification
			console.log('newMessage');
			console.log(data);
		}
	});
	server.on('membersInvited', function(data) {
		console.log('membersInvited');
		console.log(data);
	});
	server.on('membersExit', function(data) {
		console.log('membersExit');
		console.log(data);
	});
	server.on('contactChatRemoved', function(data) {
		console.log('contact chat removed');
		console.log(data);
	});
	server.on('joinContactChat', function(data) {
		if (data.status == 'success') {
			groups.push(data);
			console.log('contact chat created');
			resetChatBox();
			var groupId = data.groupId;
			setGroup(groupId);
			server.emit('readMessage', {groupId: groupId});

		} else {
			console.log('failed to create contact chat');
		}
	});
	server.on('getLocation',function(data){
		            $('html, body').animate({
                    scrollTop: $(".shareLocation").offset().top
                }, 2000);
    $(".long").val(data.long);
		$(".latt").val(data.latt);
		console.log("we get those long and latt");
		console.log(data.long);
		console.log(data.latt);
	});
	reset();


//clicks on the share position button
$(".shareLocation").on('click', function(){
	$('html, body').animate({
			scrollTop: $(".chat").offset().top
	}, 200);
	var long1 = $(".long").val().toString();
	var latt1 = $(".latt").val().toString();
	//server.emit('shareLocation',{long: long1, latt: latt1 }); //send share location event
	console.log(""+long1+latt1+"");
	server.emit('sendMessage', {groupId: chatRoom.groupId, content: "location shared", importance: 0, location: ""+long1+"+"+latt1+""} );
	addMyMessage("location sent", me.nickname , new Date(), 0); //send the message
});

	//click on the send button
	$("#btn-chat").on('click', function(){
		sendMessage();
	});

	//check the pressed key and if it is enter then send message
	$(document).keypress(function(e){
		if (e.which == 13){
			sendMessage();
		}
	});
});

function printContactList(contacts, parentDiv, pending) {
	parentDiv.innerHTML = "";
	var arrayLength = contacts.length;
	for (var i = 0; i < arrayLength; i++) {
		var contact = contacts[i];
		var invited = contact["invited"];

		var div = document.createElement("div");
		div.className ="contact";

		var contactName = document.createElement("p");
		contactName.textContent = contact["nickname"];
		contactName.className="group-contactName";
		div.appendChild(contactName);


		// also add the links to the chats
		var url = document.getElementById("phpURL").textContent;

		if (pending && invited) {
			var denyContactButton = document.createElement("button");
			denyContactButton.className = "denyContactButton";
			denyContactButton.innerHTML = "❌";
			denyContactButton.id = contact["email"];
			div.appendChild(denyContactButton);

			var acceptContactButton = document.createElement("button");
			acceptContactButton.className = "acceptContactButton";
			acceptContactButton.innerHTML = "✔️";
			acceptContactButton.id = contact["email"];
			div.appendChild(acceptContactButton);
			div.appendChild(document.createElement('br'));

		} else if (pending && !invited) {
			var denyContactButton = document.createElement("button");
			denyContactButton.className = "denyContactButton";
			denyContactButton.innerHTML = "❌";
			denyContactButton.id = contact["email"];
			div.appendChild(denyContactButton);
			div.appendChild(document.createElement('br'));

		} else {
			var removeContactButton = document.createElement("button");
			removeContactButton.className = "removeContactButton";
			removeContactButton.innerHTML = "❌";
			removeContactButton.id = contact["email"];
			div.appendChild(removeContactButton);

			var contactConferenceLink = document.createElement('a');
			contactConferenceLink.className = "conferenceLink";
			contactConferenceLink.appendChild(document.createTextNode("conference"));
			contactConferenceLink.title = "conference";
			contactConferenceLink.target = "_blank ";
			contactConferenceLink.href = "../Conference/page.php?" + "c" + contact["contactId"];
			div.appendChild(contactConferenceLink);

			var contactChatButton = document.createElement("button");
			contactChatButton.className = "contactChatButton";
			contactChatButton.onclick = "notifySound()";
			contactChatButton.innerHTML = "join chat";
			contactChatButton.id = contact['email'];
			contactChatButton['data-groupId'] = contact['groupId'];
			contactChatButton['data-nickname'] = contact['nickname'];
			div.appendChild(document.createElement('br'));
			div.appendChild(contactChatButton);



			console.log("contact : ", contact);
		}
		parentDiv.appendChild(div);
	}

	$('.acceptContactButton').unbind("click").bind("click", function() {
		server.emit('acceptContact', {email: this.id});
		server.emit('getPendingContactList'); // reload the pending contact list to remove
		server.emit('getContactList'); // reload the contact list to include the new contact
	});
	$('.denyContactButton').unbind("click").bind("click", function() {
		server.emit('denyContact', {email: this.id});
		server.emit('getPendingContactList');
	});
	$('.removeContactButton').unbind("click").bind("click", function() {
		server.emit('removeContact', {email: this.id});
		server.emit('getContactList');
	});
	$('.contactChatButton').unbind("click").bind("click", function() {
		resetChatBox();
		var contactEmail = this.id;
		var groupId = this['data-groupId'];
		var nickName = this['data-nickname'];
		if (!groupId) {
			console.log("join contact chat");
			server.emit('joinContactChat', {email: contactEmail});
		} else {
			setGroup(groupId);
			server.emit('readMessage', {groupId: groupId});
		}

		var panelHeading = document.getElementById("panel-heading");
		panelHeading.innerHTML = "<i class='fa fa-comments fa-fw'></i> Chat - " + nickName;
							"<div class='btn-group pull-right'>" +
									"<button type='button' class='btn btn-default btn-xs chatToggle'>" +
										"<i class='fa fa-chevron-down chatChevron'></i>" +
									"</button>" +
								"</div>";
	});
}

function printGroupList(groups, parentDiv, pending) {
	parentDiv.innerHTML = "";
	var arrayLength = groups.length;
	for (var i = 0; i < arrayLength; i++) {
		var group = groups[i];
		if(!group["contactId"]) {
			var invited = true;

			var div = document.createElement("div");
			div.className ="group";

			var groupName = document.createElement("p");
			groupName.textContent = group["name"];
			groupName.className="group-contactName";
			div.appendChild(groupName);

			var url = document.getElementById("phpURL").textContent;

			var groupConferenceLink = document.createElement('a');
			groupConferenceLink.className = "conferenceLink";
			groupConferenceLink.appendChild(document.createTextNode("conference"));
			groupConferenceLink.title = "conference";
			groupConferenceLink.target = "_blank ";
			groupConferenceLink.href = "../Conference/page.php?" + "g" + group["groupId"];

			var groupChatButton = document.createElement("button");
			groupChatButton.className = "groupChatButton";
			groupChatButton.innerHTML = "join chat";
			groupChatButton.id = group["groupId"];
			groupChatButton["data-groupName"] = group["name"];

			var exitGroupButton = document.createElement("button");
			exitGroupButton.className = "exitGroupButton";
			exitGroupButton.innerHTML = "❌";
			exitGroupButton.id = group["groupId"];

			var addContactToGroupForm = document.createElement('form');
			var addContactToGroupEmail = document.createElement('input');
			addContactToGroupEmail.type = 'test';
			addContactToGroupEmail.placeholder = 'contact email';
			addContactToGroupEmail.className = "addContactToGroupEmail";
			var addContactToGroupButton = document.createElement('button');
			addContactToGroupButton.className = "addContactToGroupButton";
			addContactToGroupButton.innerHTML = "➕";
			addContactToGroupButton.id = group["groupId"];

			addContactToGroupForm.appendChild(addContactToGroupEmail);
			addContactToGroupForm.appendChild(addContactToGroupButton);

			div.appendChild(exitGroupButton);
			div.appendChild(groupConferenceLink);
			div.appendChild(document.createElement('br'));
			//div.appendChild(groupChatLink);
			div.appendChild(groupChatButton);

			div.appendChild(addContactToGroupForm);

			parentDiv.appendChild(div);
		}

	}
	$('.groupChatButton').unbind("click").bind("click", function() {
		resetChatBox();
		var groupId = this.id;
		var groupName = this["data-groupName"];
		setGroup(groupId);
		server.emit('readMessage', {groupId: groupId});
		console.log('start chat in group ' + groupId);

		var panelHeading = document.getElementById("panel-heading");
		panelHeading.innerHTML = "<i class='fa fa-comments fa-fw'></i> Chat - " + groupName;
		          "<div class='btn-group pull-right'>" +
		              "<button type='button' class='btn btn-default btn-xs chatToggle'>" +
		                "<i class='fa fa-chevron-down chatChevron'></i>" +
		              "</button>" +
		            "</div>";
	});
	$('.exitGroupButton').unbind("click").bind("click", function(){
		server.emit('exitGroup', {groupId: this.id});
		server.emit('getGroupList');
	});
	$('.addContactToGroupButton').unbind("click").bind("click", function(){
		var truc = new Array();
		truc.push($(this).prev().val()); // the email given in the input field
		server.emit('inviteGroupMembers', {groupId: this.id, members: truc});
	});

}

function resetChatBox() {
	var ul = document.getElementById("ul-chatbox-messages");
	ul.innerHTML="";
}

function reset() {
	//$('#control').html("<label id='loginStatus'>status : not logined</label>");
	logined = false;
}

function addOldMessages(messages) {
	var chats = $('.chat > .chatMessage');
	var j = 0;

	for (var i = chats.length - 1; i >= 0; i--) {
		do {
			var chat = chats[i];
			var newChat = messages[j];
			var chatId = chat['data-messageId'];
			var newId = messages[j].messageId;

			var content = newChat.content;

			var date = new Date(newChat.date);
			var name = chatRoom.members[newChat.userId].nickname;

			if (chatId == newId)
				j++;
			else if (chatId < newId) {
				if (newChat.userId == me.userId)
					$(chat).append(makeMyMessage(content, me.nickname, date, newChat.importance));
				else
					$(chat).append(makeMessage(content, name, date, newChat.importance));
			} else
				continue;

			if (newChat.userId == me.userId)
				$(chat).append(makeMyMessage(content, me.nickname, date, newChat.importance));
			else
				$(chat).append(makeMessage(content, name, date, newChat.importance));

		} while (chatId < newId);
	}

	for (; j < messages.length; j++) {
		var chat = $('.chat');
		var newMessage = messages[j];

		var content = newMessage.content;
		var date = new Date(newMessage.date);
		var name = chatRoom.members[newMessage.userId].nickname;

		if (newMessage.userId == me.userId)
			chat.prepend(makeMyMessage(content, me.nickname, date, newMessage.importance));
		else
			chat.prepend(makeMessage(content, name, date, newMessage.importance));

		$('.chatTog').animate({ scrollTop: 50000 }, 1);
	}
}

// find group and set for chat
function setGroup(groupId) {
	for (var i = 0; i < groups.length; i++) {
		var group = groups[i];

		if (group.groupId == groupId) {
			var members = group.members;

			chatRoom.groupId = groupId;
			chatRoom.members = {};

			for (var j = 0; j < members.length; j++) {
				var member = members[j];

				chatRoom.members[member.userId] = member;
			}

			break;
		}
	}
}

function makeMyMessage(msg, name, date, importance) {
	var id = date + "-" + name + "-" + importance + "-" + msg;
	var r = '<li class="chatMessage right clearfix" ' + 'id="' + id +'">' +
						'<span class="chat-img pull-right">' +
							'<img src="https://placehold.it/50/55C1E7/fff" alt="User Avatar" class="img-circle" />' +
						'</span>' +
						'<div class="chat-body clearfix">' +
							'<div class="header">' +
								'<strong class="pull-right primary-font">' +
									name +
								'</strong>' +
								'<small class="text-muted">' +
									'<i class="fa fa-clock-o fa-fw"></i> ' +
									date.toLocaleString().toString() + " " + importance.toString() +
								'</small>' +
							'</div>' +
							'<p>'+msg+'</p>' +
						'</div>' +
					'</li>';
	return r;
}

function makeMessage(msg, name, date, importance) {
	var id = date + "-" + name + "-" + importance + "-" + msg;
	var r = '<li class="chatMessage left clearfix" ' + 'id="' + id + '">' +
						'<span class="chat-img pull-left">' +
							'<img src="https://placehold.it/50/55C1E7/fff" alt="User Avatar" class="img-circle"/> ' +
						'</span>' +
						'<div class="chat-body clearfix">' +
							'<div class="header">' +
								'<strong class="primary-font">' +
									name +
								'</strong>' +
								'<small class="pull-right text-muted">' +
									'<i class="fa fa-clock-o fa-fw">' + '</i>' +
									date.toLocaleString().toString() + " " + importance.toString() +
								'</small>' +
							'</div>' +
							'<p>' + msg + '</p>' +
						'</div>' +
					'</li>';


	return r;
}

function addMyMessage(msg, name, date, importance){
	$('.chat').append(makeMyMessage(msg, name, date, importance));/*'<div class="message"></p>' + name + ' : ' + msg +   '</p></div>');*/
	$('.chatTog').animate({ scrollTop: 50000 }, 1);
}

function addMessage(msg, name, date, importance){
	notifySound();
	$('.chat').append(makeMessage(msg, name, date, importance));/*'<div class="message"></p>' + name + ' : ' + msg +   '</p></div>');*/
	$('.chatTog').animate({ scrollTop: 50000 }, 1);
}

function sendMessage(){
    if ($('.messageInput').val() != "" && logined){

			var importance = document.getElementById("importance-list").selectedIndex;

    	var content = $('.messageInput').val();
      server.emit('sendMessage', {groupId: chatRoom.groupId, content: content, importance: importance, location: null} );

      addMyMessage(content, me.nickname , new Date(), importance);
      $('.messageInput').val(''); //reset the messageInput
    }
}

/* ------------------------	*/
/*			Notifications				*/
/* ------------------------	*/
var audio = new Audio('notification.ogg');

// Notification audio
function notifySound() {
	audio.play();
}

// Notification text
function notifyMessage(message) {
	message = message;

  // Let's check if the browser supports notifications
  if (!("Notification" in window)) {
    alert("This browser does not support desktop notification");
  }

  // Let's check whether notification permissions have already been granted
  else if (Notification.permission === "granted") {
    // If it's okay let's create a notification
    var notification = new Notification(message);
  }

  // Otherwise, we need to ask the user for permission
  else if (Notification.permission !== 'denied') {
    Notification.requestPermission(function (permission) {
      // If the user accepts, let's create a notification
      if (permission === "granted") {
        var notification = new Notification(message);
      }
    });
  }
}

/* ------------------------	*/
/*			Downlad Summary			*/
/* ------------------------	*/
document.getElementById("imp-dl-btn").addEventListener("click", function() {
	var level = document.getElementById("importance-choice-dl").selectedIndex;
	console.log("level : " + level);

	// selecting every message with the same importance or higher

	var chatList = document.getElementById("ul-chatbox-messages");
	var children = chatList.children;
	var result = "";


	for (var i = 0; i < children.length; i++) {
		var item = children[i];
		var data = item.id;
		console.log("data : " + data);

		var pre = data.split("-");
		var importance = pre[2];
		console.log("Importance : " + importance); // undefined

		// selecting enough importance
		if (importance >= level) {
			// treatment
			var date = pre[0];
			var author = pre[1];
			var msg = pre.slice(3);

			var string =  'Date: "' + date + '" Author: "' + author + '" Importance: "' + importance + '" Message: "' + msg + '";' + "\r\n";
      result += string;

		}
	}



	var filename = "summary.txt";
  var pom = document.createElement('a');
  pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(result));
  pom.setAttribute('download', filename);

  if (document.createEvent) {
    var event = document.createEvent('MouseEvents');
    event.initEvent('click', true, true);
    pom.dispatchEvent(event);
  }
  else {
    pom.click();
  }



});

/* ------------------------	*/
/*			Location						*/
/* ------------------------	*/

function addLocation(location){
	/*$('html, body').animate({
			scrollTop: $(".shareLocation").offset().top
	}, 2000);*/
	//location.match(/.{1,17}/g);
//$(".long").val(locationString[0]);
//$(".latt").val(locationString[1]);
}
