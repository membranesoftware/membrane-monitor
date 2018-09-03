var SystemInterface=exports;SystemInterface.Version="4-stable-63624f4a";SystemInterface.Command={};SystemInterface.Command.AgentConfiguration={"id":45,"name":"AgentConfiguration","paramType":"AgentConfiguration"};SystemInterface.Command.AgentContact={"id":33,"name":"AgentContact","paramType":"AgentContact"};SystemInterface.Command.AgentStatus={"id":1,"name":"AgentStatus","paramType":"AgentStatus"};SystemInterface.Command.CancelTask={"id":28,"name":"CancelTask","paramType":"CancelTask"};SystemInterface.Command.ClearDisplay={"id":31,"name":"ClearDisplay","paramType":"EmptyObject"};SystemInterface.Command.CommandResult={"id":0,"name":"CommandResult","paramType":"CommandResult"};SystemInterface.Command.CreateMediaStream={"id":14,"name":"CreateMediaStream","paramType":"CreateMediaStream"};SystemInterface.Command.CreateMonitorIntent={"id":35,"name":"CreateMonitorIntent","paramType":"CreateMonitorIntent"};SystemInterface.Command.DisplayServerStatus={"id":7,"name":"DisplayServerStatus","paramType":"DisplayServerStatus"};SystemInterface.Command.EndSet={"id":21,"name":"EndSet","paramType":"EmptyObject"};SystemInterface.Command.EventRecord={"id":40,"name":"EventRecord","paramType":"EventRecord"};SystemInterface.Command.FindItems={"id":3,"name":"FindItems","paramType":"FindItems"};SystemInterface.Command.FindMediaResult={"id":6,"name":"FindMediaResult","paramType":"FindMediaResult"};SystemInterface.Command.FindStreamResult={"id":4,"name":"FindStreamResult","paramType":"FindStreamResult"};SystemInterface.Command.GetAgentConfiguration={"id":44,"name":"GetAgentConfiguration","paramType":"EmptyObject"};SystemInterface.Command.GetHlsHtml5Interface={"id":25,"name":"GetHlsHtml5Interface","paramType":"GetHlsHtml5Interface"};SystemInterface.Command.GetHlsManifest={"id":23,"name":"GetHlsManifest","paramType":"GetHlsManifest"};SystemInterface.Command.GetHlsSegment={"id":24,"name":"GetHlsSegment","paramType":"GetHlsSegment"};SystemInterface.Command.GetMedia={"id":15,"name":"GetMedia","paramType":"GetMedia"};SystemInterface.Command.GetStatus={"id":8,"name":"GetStatus","paramType":"EmptyObject"};SystemInterface.Command.GetThumbnailImage={"id":5,"name":"GetThumbnailImage","paramType":"GetThumbnailImage"};SystemInterface.Command.IntentState={"id":36,"name":"IntentState","paramType":"IntentState"};SystemInterface.Command.LinkServerStatus={"id":12,"name":"LinkServerStatus","paramType":"LinkServerStatus"};SystemInterface.Command.MasterServerStatus={"id":11,"name":"MasterServerStatus","paramType":"MasterServerStatus"};SystemInterface.Command.MediaItem={"id":16,"name":"MediaItem","paramType":"MediaItem"};SystemInterface.Command.MediaServerStatus={"id":9,"name":"MediaServerStatus","paramType":"MediaServerStatus"};SystemInterface.Command.MonitorServerStatus={"id":48,"name":"MonitorServerStatus","paramType":"MonitorServerStatus"};SystemInterface.Command.PlayMedia={"id":30,"name":"PlayMedia","paramType":"PlayMedia"};SystemInterface.Command.ReadEvents={"id":18,"name":"ReadEvents","paramType":"ReadEvents"};SystemInterface.Command.RemoveIntent={"id":37,"name":"RemoveIntent","paramType":"RemoveIntent"};SystemInterface.Command.RemoveStream={"id":29,"name":"RemoveStream","paramType":"RemoveStream"};SystemInterface.Command.ReportContact={"id":32,"name":"ReportContact","paramType":"ReportContact"};SystemInterface.Command.ReportStatus={"id":2,"name":"ReportStatus","paramType":"ReportStatus"};SystemInterface.Command.ServerError={"id":20,"name":"ServerError","paramType":"ServerError"};SystemInterface.Command.SetController={"id":13,"name":"SetController","paramType":"SetController"};SystemInterface.Command.SetIntentActive={"id":38,"name":"SetIntentActive","paramType":"SetIntentActive"};SystemInterface.Command.ShowWebUrl={"id":34,"name":"ShowWebUrl","paramType":"ShowWebUrl"};SystemInterface.Command.ShutdownAgent={"id":43,"name":"ShutdownAgent","paramType":"EmptyObject"};SystemInterface.Command.StartServers={"id":47,"name":"StartServers","paramType":"EmptyObject"};SystemInterface.Command.StopServers={"id":46,"name":"StopServers","paramType":"EmptyObject"};SystemInterface.Command.StreamItem={"id":22,"name":"StreamItem","paramType":"StreamItem"};SystemInterface.Command.StreamServerStatus={"id":10,"name":"StreamServerStatus","paramType":"StreamServerStatus"};SystemInterface.Command.TaskItem={"id":26,"name":"TaskItem","paramType":"TaskItem"};SystemInterface.Command.UpdateAgentConfiguration={"id":42,"name":"UpdateAgentConfiguration","paramType":"UpdateAgentConfiguration"};SystemInterface.Command.UpdateIntentState={"id":39,"name":"UpdateIntentState","paramType":"UpdateIntentState"};SystemInterface.Command.WatchEventSet={"id":19,"name":"WatchEventSet","paramType":"WatchEventSet"};SystemInterface.Command.WatchEvents={"id":27,"name":"WatchEvents","paramType":"WatchEvents"};SystemInterface.Command.WriteEvents={"id":17,"name":"WriteEvents","paramType":"WriteEvents"};SystemInterface.CommandId={};SystemInterface.CommandId.AgentConfiguration=45;SystemInterface.CommandId.AgentContact=33;SystemInterface.CommandId.AgentStatus=1;SystemInterface.CommandId.CancelTask=28;SystemInterface.CommandId.ClearDisplay=31;SystemInterface.CommandId.CommandResult=0;SystemInterface.CommandId.CreateMediaStream=14;SystemInterface.CommandId.CreateMonitorIntent=35;SystemInterface.CommandId.DisplayServerStatus=7;SystemInterface.CommandId.EndSet=21;SystemInterface.CommandId.EventRecord=40;SystemInterface.CommandId.FindItems=3;SystemInterface.CommandId.FindMediaResult=6;SystemInterface.CommandId.FindStreamResult=4;SystemInterface.CommandId.GetAgentConfiguration=44;SystemInterface.CommandId.GetHlsHtml5Interface=25;SystemInterface.CommandId.GetHlsManifest=23;SystemInterface.CommandId.GetHlsSegment=24;SystemInterface.CommandId.GetMedia=15;SystemInterface.CommandId.GetStatus=8;SystemInterface.CommandId.GetThumbnailImage=5;SystemInterface.CommandId.IntentState=36;SystemInterface.CommandId.LinkServerStatus=12;SystemInterface.CommandId.MasterServerStatus=11;SystemInterface.CommandId.MediaItem=16;SystemInterface.CommandId.MediaServerStatus=9;SystemInterface.CommandId.MonitorServerStatus=48;SystemInterface.CommandId.PlayMedia=30;SystemInterface.CommandId.ReadEvents=18;SystemInterface.CommandId.RemoveIntent=37;SystemInterface.CommandId.RemoveStream=29;SystemInterface.CommandId.ReportContact=32;SystemInterface.CommandId.ReportStatus=2;SystemInterface.CommandId.ServerError=20;SystemInterface.CommandId.SetController=13;SystemInterface.CommandId.SetIntentActive=38;SystemInterface.CommandId.ShowWebUrl=34;SystemInterface.CommandId.ShutdownAgent=43;SystemInterface.CommandId.StartServers=47;SystemInterface.CommandId.StopServers=46;SystemInterface.CommandId.StreamItem=22;SystemInterface.CommandId.StreamServerStatus=10;SystemInterface.CommandId.TaskItem=26;SystemInterface.CommandId.UpdateAgentConfiguration=42;SystemInterface.CommandId.UpdateIntentState=39;SystemInterface.CommandId.WatchEventSet=19;SystemInterface.CommandId.WatchEvents=27;SystemInterface.CommandId.WriteEvents=17;SystemInterface.Type={};SystemInterface.Type.AgentConfiguration=[{"name":"isEnabled","type":"boolean","flags":0},{"name":"displayName","type":"string","flags":3},{"name":"linkServerConfiguration","type":"LinkServerConfiguration","flags":0},{"name":"mediaServerConfiguration","type":"MediaServerConfiguration","flags":0},{"name":"streamServerConfiguration","type":"StreamServerConfiguration","flags":0},{"name":"displayServerConfiguration","type":"DisplayServerConfiguration","flags":0}];SystemInterface.Type.AgentContact=[{"name":"id","type":"string","flags":35},{"name":"urlHostname","type":"string","flags":5},{"name":"tcpPort","type":"number","flags":129,"rangeMin":1,"rangeMax":65535},{"name":"udpPort","type":"number","flags":129,"rangeMin":1,"rangeMax":65535},{"name":"version","type":"string","flags":3},{"name":"nodeVersion","type":"string","flags":0,"defaultValue":""},{"name":"linkUrl","type":"string","flags":66}];SystemInterface.Type.AgentStatus=[{"name":"id","type":"string","flags":35},{"name":"displayName","type":"string","flags":3},{"name":"applicationName","type":"string","flags":3},{"name":"urlHostname","type":"string","flags":5},{"name":"tcpPort","type":"number","flags":129,"rangeMin":1,"rangeMax":65535},{"name":"udpPort","type":"number","flags":129,"rangeMin":1,"rangeMax":65535},{"name":"uptime","type":"string","flags":1,"defaultValue":""},{"name":"version","type":"string","flags":3},{"name":"nodeVersion","type":"string","flags":0,"defaultValue":""},{"name":"platform","type":"string","flags":0,"defaultValue":""},{"name":"isRunning","type":"boolean","flags":1},{"name":"tasks","type":"array","containerType":"TaskItem","flags":1},{"name":"runCount","type":"number","flags":17},{"name":"maxRunCount","type":"number","flags":17},{"name":"linkServerStatus","type":"LinkServerStatus","flags":0},{"name":"mediaServerStatus","type":"MediaServerStatus","flags":0},{"name":"streamServerStatus","type":"StreamServerStatus","flags":0},{"name":"displayServerStatus","type":"DisplayServerStatus","flags":0},{"name":"masterServerStatus","type":"MasterServerStatus","flags":0},{"name":"monitorServerStatus","type":"MonitorServerStatus","flags":0}];SystemInterface.Type.CancelTask=[{"name":"taskId","type":"string","flags":35}];SystemInterface.Type.CommandResult=[{"name":"success","type":"boolean","flags":1},{"name":"error","type":"string","flags":0},{"name":"itemId","type":"string","flags":32},{"name":"item","type":"object","flags":256},{"name":"taskId","type":"string","flags":32}];SystemInterface.Type.CreateMediaStream=[{"name":"name","type":"string","flags":1},{"name":"mediaId","type":"string","flags":35},{"name":"mediaUrl","type":"string","flags":65}];SystemInterface.Type.CreateMonitorIntent=[{"name":"displayName","type":"string","flags":3},{"name":"urls","type":"array","containerType":"string","flags":3},{"name":"isShuffle","type":"boolean","flags":1},{"name":"minItemDisplayDuration","type":"number","flags":17,"defaultValue":300},{"name":"maxItemDisplayDuration","type":"number","flags":17,"defaultValue":900}];SystemInterface.Type.DisplayServerConfiguration=[];SystemInterface.Type.DisplayServerStatus=[{"name":"controllerId","type":"string","flags":32,"defaultValue":""},{"name":"isPlaying","type":"boolean","flags":1},{"name":"mediaName","type":"string","flags":1,"defaultValue":""},{"name":"isShowingUrl","type":"boolean","flags":1},{"name":"showUrl","type":"string","flags":1,"defaultValue":""}];SystemInterface.Type.EmptyObject=[];SystemInterface.Type.EventRecord=[{"name":"record","type":"object","flags":257}];SystemInterface.Type.FindItems=[{"name":"name","type":"string","flags":1},{"name":"maxResults","type":"number","flags":17,"defaultValue":0}];SystemInterface.Type.FindMediaResult=[{"name":"items","type":"array","containerType":"MediaItem","flags":1},{"name":"mediaUrl","type":"string","flags":1},{"name":"thumbnailUrl","type":"string","flags":1,"defaultValue":""},{"name":"thumbnailCount","type":"number","flags":17,"defaultValue":0}];SystemInterface.Type.FindStreamResult=[{"name":"items","type":"array","containerType":"StreamItem","flags":1},{"name":"hlsStreamUrl","type":"string","flags":1},{"name":"hlsHtml5Url","type":"string","flags":1},{"name":"thumbnailUrl","type":"string","flags":1}];SystemInterface.Type.GetHlsHtml5Interface=[{"name":"streamId","type":"string","flags":35}];SystemInterface.Type.GetHlsManifest=[{"name":"streamId","type":"string","flags":35},{"name":"startPosition","type":"number","flags":17,"defaultValue":0}];SystemInterface.Type.GetHlsSegment=[{"name":"streamId","type":"string","flags":35},{"name":"segmentIndex","type":"number","flags":17,"defaultValue":0}];SystemInterface.Type.GetMedia=[{"name":"id","type":"string","flags":35}];SystemInterface.Type.GetThumbnailImage=[{"name":"id","type":"string","flags":35},{"name":"thumbnailIndex","type":"number","flags":17,"defaultValue":0}];SystemInterface.Type.IntentState=[{"name":"id","type":"string","flags":35},{"name":"name","type":"string","flags":3},{"name":"displayName","type":"string","flags":1,"defaultValue":""},{"name":"isActive","type":"boolean","flags":1},{"name":"state","type":"object","flags":1}];SystemInterface.Type.LinkServerConfiguration=[];SystemInterface.Type.LinkServerStatus=[{"name":"linkUrl","type":"string","flags":67}];SystemInterface.Type.MasterServerStatus=[{"name":"isReady","type":"boolean","flags":1},{"name":"intentCount","type":"number","flags":17}];SystemInterface.Type.MediaItem=[{"name":"id","type":"string","flags":33},{"name":"name","type":"string","flags":1},{"name":"mtime","type":"number","flags":17,"defaultValue":0},{"name":"duration","type":"number","flags":17},{"name":"frameRate","type":"number","flags":17},{"name":"width","type":"number","flags":17},{"name":"height","type":"number","flags":17},{"name":"size","type":"number","flags":17},{"name":"bitrate","type":"number","flags":17}];SystemInterface.Type.MediaServerConfiguration=[{"name":"mediaPath","type":"string","flags":2},{"name":"dataPath","type":"string","flags":2},{"name":"scanPeriod","type":"number","flags":16}];SystemInterface.Type.MediaServerStatus=[{"name":"isReady","type":"boolean","flags":1},{"name":"mediaCount","type":"number","flags":17},{"name":"mediaUrl","type":"string","flags":65},{"name":"thumbnailUrl","type":"string","flags":65,"defaultValue":""},{"name":"thumbnailCount","type":"number","flags":17,"defaultValue":0}];SystemInterface.Type.MonitorServerStatus=[{"name":"isPlaying","type":"boolean","flags":1},{"name":"mediaName","type":"string","flags":1,"defaultValue":""},{"name":"isShowingUrl","type":"boolean","flags":1},{"name":"showUrl","type":"string","flags":1,"defaultValue":""},{"name":"intentName","type":"string","flags":1,"defaultValue":""}];SystemInterface.Type.PlayMedia=[{"name":"mediaName","type":"string","flags":1,"defaultValue":""},{"name":"streamUrl","type":"string","flags":67}];SystemInterface.Type.ReadEvents=[{"name":"responseCommandType","type":"number","flags":1,"defaultValue":0},{"name":"commandId","type":"number","flags":0},{"name":"commandType","type":"number","flags":0},{"name":"agentId","type":"string","flags":34},{"name":"ignoreRecordId","type":"boolean","flags":0},{"name":"ignoreRecordClose","type":"boolean","flags":0}];SystemInterface.Type.RemoveIntent=[{"name":"id","type":"string","flags":35}];SystemInterface.Type.RemoveStream=[{"name":"id","type":"string","flags":35}];SystemInterface.Type.ReportContact=[{"name":"destination","type":"string","flags":65},{"name":"reportCommandType","type":"number","flags":1,"defaultValue":0}];SystemInterface.Type.ReportStatus=[{"name":"destination","type":"string","flags":65},{"name":"reportCommandType","type":"number","flags":1,"defaultValue":0}];SystemInterface.Type.ServerError=[{"name":"error","type":"string","flags":0,"defaultValue":""}];SystemInterface.Type.SetController=[{"name":"id","type":"string","flags":33},{"name":"priority","type":"number","flags":17,"defaultValue":0}];SystemInterface.Type.SetIntentActive=[{"name":"id","type":"string","flags":35},{"name":"isActive","type":"boolean","flags":1}];SystemInterface.Type.ShowWebUrl=[{"name":"url","type":"string","flags":67}];SystemInterface.Type.StreamItem=[{"name":"id","type":"string","flags":35},{"name":"name","type":"string","flags":3},{"name":"sourceId","type":"string","flags":35},{"name":"duration","type":"number","flags":17},{"name":"width","type":"number","flags":17},{"name":"height","type":"number","flags":17},{"name":"bitrate","type":"number","flags":17},{"name":"frameRate","type":"number","flags":17},{"name":"hlsTargetDuration","type":"number","flags":17},{"name":"segmentCount","type":"number","flags":17},{"name":"segmentFilenames","type":"array","containerType":"string","flags":1},{"name":"segmentLengths","type":"array","containerType":"number","flags":17},{"name":"segmentPositions","type":"array","containerType":"number","flags":17}];SystemInterface.Type.StreamServerConfiguration=[{"name":"dataPath","type":"string","flags":2}];SystemInterface.Type.StreamServerStatus=[{"name":"isReady","type":"boolean","flags":1},{"name":"streamCount","type":"number","flags":17},{"name":"freeSpace","type":"number","flags":17},{"name":"totalSpace","type":"number","flags":17},{"name":"hlsStreamUrl","type":"string","flags":65},{"name":"hlsHtml5Url","type":"string","flags":65},{"name":"thumbnailUrl","type":"string","flags":65}];SystemInterface.Type.TaskItem=[{"name":"id","type":"string","flags":33},{"name":"name","type":"string","flags":3},{"name":"subtitle","type":"string","flags":1,"defaultValue":""},{"name":"tags","type":"array","containerType":"string","flags":3},{"name":"description","type":"string","flags":1,"defaultValue":""},{"name":"percentComplete","type":"number","flags":129,"rangeMin":0,"rangeMax":100,"defaultValue":0}];SystemInterface.Type.UpdateAgentConfiguration=[{"name":"agentConfiguration","type":"AgentConfiguration","flags":1}];SystemInterface.Type.UpdateIntentState=[{"name":"id","type":"string","flags":35},{"name":"state","type":"object","flags":1},{"name":"isReplace","type":"boolean","flags":1,"defaultValue":!1}];SystemInterface.Type.WatchEventSet=[{"name":"responseCommandType","type":"number","flags":1,"defaultValue":0},{"name":"commandId","type":"number","flags":1}];SystemInterface.Type.WatchEvents=[{"name":"responseCommandType","type":"number","flags":1,"defaultValue":0},{"name":"recordId","type":"string","flags":35}];SystemInterface.Type.WriteEvents=[{"name":"items","type":"array","containerType":"object","flags":257}];SystemInterface.ParamFlag={};SystemInterface.ParamFlag.Required=1;SystemInterface.ParamFlag.NotEmpty=2;SystemInterface.ParamFlag.Hostname=4;SystemInterface.ParamFlag.GreaterThanZero=8;SystemInterface.ParamFlag.ZeroOrGreater=16;SystemInterface.ParamFlag.Uuid=32;SystemInterface.ParamFlag.Url=64;SystemInterface.ParamFlag.RangedNumber=128;SystemInterface.ParamFlag.Command=256;SystemInterface.Constant={};SystemInterface.Constant.MaxCommandPriority=100;SystemInterface.Constant.WebSocketEvent="SystemInterface";SystemInterface.Constant.DefaultTcpPort=63738;SystemInterface.Constant.DefaultUdpPort=63738;SystemInterface.Constant.DefaultCommandType=0;SystemInterface.Constant.Stream=1;SystemInterface.Constant.Media=2;SystemInterface.Constant.Display=3;SystemInterface.Constant.Link=4;SystemInterface.Constant.Master=5;SystemInterface.Constant.CommandTypeCount=6;SystemInterface.Constant.WebDisplayIntent="WebDisplayIntent";SystemInterface.createCommandPrefix=function(e,a,n,t,r){var m;m={};typeof e!="string"&&(e="");m.agentId=e;typeof a!="string"&&(a="");m.userId=a;typeof n!="number"&&(n=0);n<0&&(n=0);n>SystemInterface.MaxCommandPriority&&(n=SystemInterface.MaxCommandPriority);m.priority=Math.floor(n);typeof t!="number"&&(t=0);t<0&&(t=0);m.startTime=t;typeof r!="number"&&(r=0);r<0&&(r=0);m.duration=r;return m};SystemInterface.createCommand=function(e,a,n,t){var r,m,s,i;r=SystemInterface.Command[a];if(r==null){return"Unknown command name \""+a+"\""}s=SystemInterface.Type[r.paramType];if(s==null){return"Command \""+a+"\" has unknown parameter type \""+r.paramType+"\""}m={};m.command=r.id;m.commandName=r.name;m.commandType=0;typeof n=='number'&&n>=0&&(m.commandType=n);(e==null||typeof e!="object")&&(e={});m.prefix=e;(t==null||typeof t!="object")&&(t={});SystemInterface.populateDefaultFields(t,s);i=SystemInterface.getParamError(t,s);if(i!=null){return i}m.params=t;return m};SystemInterface.setRecordFields=function(e,a,n){e.prefix.recordId=a;e.prefix.recordTime=n};SystemInterface.createMainRecordCriteria=function(e){return({"prefix.recordId":e.prefix.recordId,"prefix.isRecordMain":!0})};SystemInterface.setRecordMain=function(e,a){typeof a!="boolean"&&(a=!0);e.prefix.isRecordMain=a};SystemInterface.isRecordMain=function(e){return e.prefix.isRecordMain===!0};SystemInterface.closeRecord=function(e){e.prefix.isRecordClosed=!0};SystemInterface.isRecordClosed=function(e){return e.prefix.isRecordClosed===!0};SystemInterface.getParamError=function(e,a,n){var t,r,m,s,i,o,l,d,p;if(n!==!0){m={};for(t=0;t<a.length;++t)r=a[t],m[r.name]=!0;for(t in e){if(m[t]!==!0){return"Unknown parameter field \""+t+"\""}}}for(t=0;t<a.length;++t){r=a[t];s=e[r.name];if(s===void 0){if(r.flags&SystemInterface.ParamFlag.Required){return"Missing required parameter field \""+r.name+"\""}continue}switch(r.type){case "number":{if(typeof s!="number"){return"Parameter field \""+r.name+"\" has incorrect type \""+typeof s+"\", expecting number"}if(isNaN(s)){return"Parameter field \""+r.name+"\" is not a valid number value"}if(r.flags&SystemInterface.ParamFlag.GreaterThanZero){if(s<=0){return"Parameter field \""+r.name+"\" must be a number greater than zero"}}if(r.flags&SystemInterface.ParamFlag.ZeroOrGreater){if(s<0){return"Parameter field \""+r.name+"\" must be a number greater than or equal to zero"}}if(r.flags&SystemInterface.ParamFlag.RangedNumber){if(typeof r.rangeMin=="number"&&typeof r.rangeMax=="number"){if(s<r.rangeMin||s>r.rangeMax){return"Parameter field \""+r.name+"\" must be a number in the range ["+r.rangeMin+".."+r.rangeMax+"]"}}}break};case "boolean":{if(typeof s!="boolean"){return"Parameter field \""+r.name+"\" has incorrect type \""+typeof s+"\", expecting boolean"}break};case "string":{if(typeof s!="string"){return"Parameter field \""+r.name+"\" has incorrect type \""+typeof s+"\", expecting string"}if(r.flags&SystemInterface.ParamFlag.NotEmpty){if(s==""){return"Parameter field \""+r.name+"\" cannot contain an empty string"}}if(r.flags&SystemInterface.ParamFlag.Hostname&&s!=""){if(s.search(/^[a-zA-Z0-9-\.]+(:[0-9]+){0,1}$/)!=0){return"Parameter field \""+r.name+"\" must contain a hostname string"}}if(r.flags&SystemInterface.ParamFlag.Uuid&&s!=""){if(s.search(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)!=0){return"Parameter field \""+r.name+"\" must contain a UUID string"}}if(r.flags&SystemInterface.ParamFlag.Url&&s!=""){if(s.search(/[^A-Za-z0-9\$\-_\.\+\!\*\?\(\),\/:;=&%#]/)!=-1){return"Parameter field \""+r.name+"\" must contain a URL string"}}break};case "array":{if(typeof s!="object"||s.length===void 0){return"Parameter field \""+r.name+"\" has incorrect type \""+typeof s+"\", expecting array"}l=r.containerType;if(typeof l!="string"){return"Parameter field \""+r.name+"\" is missing expected container type"}if(l=="number"){for(d=0;d<s.length;++d){p=s[d];if(typeof p!="number"){return"Parameter field \""+r.name+"\" has number array with invalid items"}if(r.flags&SystemInterface.ParamFlag.GreaterThanZero){if(p<=0){return"Parameter field \""+r.name+"\" must contain numbers greater than zero"}}if(r.flags&SystemInterface.ParamFlag.ZeroOrGreater){if(p<0){return"Parameter field \""+r.name+"\" must contain numbers greater than or equal to zero"}}if(r.flags&SystemInterface.ParamFlag.RangedNumber){if(typeof r.rangeMin=="number"&&typeof r.rangeMax=="number"){if(p<r.rangeMin||p>r.rangeMax){return"Parameter field \""+r.name+"\" must contain numbers in the range ["+r.rangeMin+".."+r.rangeMax+"]"}}}}}else if(l=="boolean"){for(d=0;d<s.length;++d){p=s[d];if(typeof p!="boolean"){return"Parameter field \""+r.name+"\" has boolean array with invalid items"}}}else if(l=="string"){for(d=0;d<s.length;++d){p=s[d];if(typeof p!="string"){return"Parameter field \""+r.name+"\" has string array with invalid items"}if(r.flags&SystemInterface.ParamFlag.NotEmpty){if(p==""){return"Parameter field \""+r.name+"\" cannot contain empty strings"}}if(r.flags&SystemInterface.ParamFlag.Hostname&&p!=""){if(p.search(/^[a-zA-Z][a-zA-Z0-9-\.]*(:[0-9]+){0,1}$/)!=0){return"Parameter field \""+r.name+"\" must contain hostname strings"}}if(r.flags&SystemInterface.ParamFlag.Uuid&&p!=""){if(p.search(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)!=0){return"Parameter field \""+r.name+"\" must contain UUID strings"}}if(r.flags&SystemInterface.ParamFlag.Url&&p!=""){if(p.search(/[^A-Za-z0-9\$\-_\.\+\!\*\?\(\),\/:;=&]/)!=-1){return"Parameter field \""+r.name+"\" must contain URL strings"}}}}else if(l=="object"){for(d=0;d<s.length;++d){p=s[d];if(typeof p!="object"||p==null){return"Parameter field \""+r.name+"\" has object array with invalid items"}if(r.flags&SystemInterface.ParamFlag.Command&&p!=null){o=SystemInterface.parseCommand(p);if(SystemInterface.isError(o)){return"Array parameter \""+r.name+"["+d+"]\": "+o}}}}else{i=SystemInterface.Type[l];if(i==null){return"Parameter field \""+r.name+"\" has unknown container type \""+l+"\""}for(d=0;d<s.length;++d){p=s[d];o=SystemInterface.getParamError(p,i,n);if(SystemInterface.isError(o)){return"Array parameter \""+r.name+"["+d+"]\": "+o}}}break};case "map":{if(typeof s!="object"){return"Parameter field \""+r.name+"\" has incorrect type \""+typeof s+"\", expecting object"}l=r.containerType;if(typeof l!="string"){return"Parameter field \""+r.name+"\" is missing expected container type"}if(l=="number"){for(d in s){p=s[d];if(typeof p!="number"){return"Parameter field \""+r.name+"\" has number array with invalid items"}if(r.flags&SystemInterface.ParamFlag.GreaterThanZero){if(p<=0){return"Parameter field \""+r.name+"\" must contain numbers greater than zero"}}if(r.flags&SystemInterface.ParamFlag.ZeroOrGreater){if(p<0){return"Parameter field \""+r.name+"\" must contain numbers greater than or equal to zero"}}if(r.flags&SystemInterface.ParamFlag.RangedNumber){if(typeof r.rangeMin=="number"&&typeof r.rangeMax=="number"){if(p<r.rangeMin||p>r.rangeMax){return"Parameter field \""+r.name+"\" must contain numbers in the range ["+r.rangeMin+".."+r.rangeMax+"]"}}}}}else if(l=="boolean"){for(d in s){p=s[d];if(typeof p!="boolean"){return"Parameter field \""+r.name+"\" has boolean array with invalid items"}}}else if(l=="string"){for(d in s){p=s[d];if(typeof p!="string"){return"Parameter field \""+r.name+"\" has string array with invalid items"}if(r.flags&SystemInterface.ParamFlag.NotEmpty){if(p==""){return"Parameter field \""+r.name+"\" cannot contain empty strings"}}if(r.flags&SystemInterface.ParamFlag.Hostname&&p!=""){if(p.search(/^[a-zA-Z][a-zA-Z0-9-\.]*(:[0-9]+){0,1}$/)!=0){return"Parameter field \""+r.name+"\" must contain hostname strings"}}if(r.flags&SystemInterface.ParamFlag.Uuid&&p!=""){if(p.search(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)!=0){return"Parameter field \""+r.name+"\" must contain UUID strings"}}if(r.flags&SystemInterface.ParamFlag.Url&&p!=""){if(p.search(/[^A-Za-z0-9\$\-_\.\+\!\*\?\(\),\/:;=&]/)!=-1){return"Parameter field \""+r.name+"\" must contain URL strings"}}}}else if(l=="object"){for(d in s){p=s[d];if(typeof p!="object"||p==null){return"Parameter field \""+r.name+"\" has object array with invalid items"}if(r.flags&SystemInterface.ParamFlag.Command&&p!=null){o=SystemInterface.parseCommand(p);if(SystemInterface.isError(o)){return"Map parameter \""+r.name+"["+d+"]\": "+o}}}}else{i=SystemInterface.Type[l];if(i==null){return"Parameter field \""+r.name+"\" has unknown container type \""+l+"\""}for(d in s){p=s[d];o=SystemInterface.getParamError(p,i,n);if(SystemInterface.isError(o)){return"Map parameter \""+r.name+"["+d+"]\": "+o}}}break};case "object":{if(typeof s!="object"){return"Parameter field \""+r.name+"\" has incorrect type \""+typeof s+"\", expecting object"}if(r.flags&SystemInterface.ParamFlag.Command&&s!=null){o=SystemInterface.parseCommand(s);if(SystemInterface.isError(o)){return"Parameter field \""+r.name+"\": "+o}}break};default:{i=SystemInterface.Type[r.type];if(i==null){return"Parameter field \""+r.name+"\" has unknown type \""+r.type+"\""}o=SystemInterface.getParamError(s,i,n);if(SystemInterface.isError(o)){return o}break}}}};SystemInterface.parseCommand=function(e,a){var n,t,r;if(typeof e=="string"){try{e=JSON.parse(e)}catch(e){return"Command has non-parsing JSON, "+e}}if(typeof e!="object"||e==null){return"Command is not an object"}if(typeof a=="object"&&a.length!==void 0)r=a,t=e;else{if(typeof e.commandName!="string"){return"Command has no commandName field"}if(typeof e.params!="object"||e.params==null){return"Command has no params object"}t=e.params;n=SystemInterface.Command[e.commandName];if(n==null){return"Command has unknown name \""+e.commandName+"\""}r=SystemInterface.Type[n.paramType];if(r==null){return"Command \""+e.commandName+"\" has unknown parameter type \""+n.paramType+"\""}}SystemInterface.populateDefaultFields(t,r);SystemInterface.resolveTypes(t,r);err=SystemInterface.getParamError(t,r);if(err!=null){return err}typeof e.commandType!='number'&&(e.commandType=0);return e};SystemInterface.populateDefaultFields=function(e,a){var n,t,r,m,s,i;for(n=0;n<a.length;++n){t=a[n];if(t.type=="array"&&typeof t.containerType=="string"){i=SystemInterface.Type[t.containerType];if(i!=null){s=e[t.name];if(typeof s=="object"&&s.length!==void 0){for(r=0;r<s.length;++r)m=s[r],SystemInterface.populateDefaultFields(m,i)}}}else if(t.type=="map"&&typeof t.containerType=="string"){i=SystemInterface.Type[t.containerType];if(i!=null){s=e[t.name];if(typeof s=="object"){for(r in s)m=s[r],SystemInterface.populateDefaultFields(m,i)}}}else e[t.name]===void 0&&t.defaultValue!==void 0&&(e[t.name]=t.defaultValue)}};SystemInterface.resolveTypes=function(e,a){var n,t,r,m,s,i,o;for(n=0;n<a.length;++n){t=a[n];s=e[t.name];if(t.type=="array"&&typeof t.containerType=="string"){i=SystemInterface.Type[t.containerType];if(i!=null){if(typeof s=="object"&&s.length!==void 0){for(r=0;r<s.length;++r)m=s[r],SystemInterface.resolveTypes(m,i)}}}else if(t.type=="map"&&typeof t.containerType=="string"){i=SystemInterface.Type[t.containerType];if(i!=null){if(typeof s=="object"){for(r in s)m=s[r],SystemInterface.resolveTypes(m,i)}}}else typeof s=="string"&&(t.type=="number"?(o=parseInt(s,10),isNaN(o)||(e[t.name]=o)):t.type=="boolean"&&(s=s.toLowerCase(),s=="true"?(e[t.name]=!0):s=="false"&&(e[t.name]=!1)))}};SystemInterface.parseTypeObject=function(e,a){var n;n=SystemInterface.Type[e];if(n==null){return"Unknown type \""+e+"\""}return(SystemInterface.parseFields(n,a))};SystemInterface.parseFields=function(e,a){var n;if(typeof a=="string"){try{a=JSON.parse(a)}catch(e){return"Field data has non-parsing JSON, "+e}}if(typeof a!="object"||a==null){return"Field data is not an object"}if(typeof e!="object"||e.length===void 0){return"Param list is not an array"}SystemInterface.populateDefaultFields(a,e);SystemInterface.resolveTypes(a,e);n=SystemInterface.getParamError(a,e);if(n!=null){return n}return a};SystemInterface.copyFields=function(e,a,n){var t,r,m;t=SystemInterface.Type[e];if(t==null){return}for(r=0;r<t.length;++r)m=t[r].name,a[m]=n[m]};SystemInterface.isError=function(e){return typeof e=="string"}