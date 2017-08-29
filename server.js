var express     =   require("express");
var bodyParser  =   require("body-parser");
var mongo 		= 	require('mongoskin'); 


var https	  	=   require('https');
var fs		 	=	require('fs');
var crypto		= 	require('crypto');


var app         =   express();
var router      =   express.Router();

var url 		= 'mongodb://localhost:27017/idf_restdb';
var db 			= mongo.db(url, {native_parser:true}); 

app.all('*', function(req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	// res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
	res.header('Access-Control-Allow-Methods', 'GET, POST');
	res.header('Access-Control-Allow-Headers', 'X-Requested-With, content-type, Authorization');
	next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({"extended" : false}));

router.get("/", function(req,res){
    res.json({"message" : "독립운동 검색 API v2.0 입니다."});
});


// 통합검색
/*************************************************
Account 리스트 지도 조회
required(param) : searchLong
                  searchLat
				  searchDate
				  sortOption
optional(query) : searchAreaId
                  searchAccountId
                  searchCategoryId
                  searchSubCategoryId
				  searchFrom:areaMap
				  xkm

*************************************************/
router.route('/searchAccount/:searchLong,:searchLat/:searchDate/:sortOption/').get(function(req, res) {


	var searchLong	= req.params.searchLong!= null ? req.params.searchLong : '';
	var searchLat	= req.params.searchLat != null ? req.params.searchLat : '';
	var searchDate	= req.params.searchDate != null ? req.params.searchDate : '';
	var sortOption	= req.params.sortOption != null ? req.params.sortOption : '';

	console.log('searchLong: ' + searchLong);
	console.log('searchLat: ' + searchLat);
	console.log('searchDate: ' + searchDate);

	var searchErr = '';
	if(searchLong == ''){
		searchErr += 'searchLong is null.\n';
	}
	if(searchLat == '' ){
		searchErr += 'searchLat is null.\n';
	}
	if(searchDate == '' ){
		searchErr += 'searchDate is null.\n';
	}
	if(sortOption == '' ){
		searchErr += 'sortOption is null.\n';
	}

	if(searchErr!=''){
		console.log(searchErr);
		res.json({"searchErr" : searchErr});
		return;
			
	}


	var fromDate = new Date(searchDate);
	fromDate.setHours(0);
	fromDate.setMinutes(0);
	fromDate.setSeconds(0);
	fromDate.setMilliseconds(0);

	var today = new Date();
	if(fromDate.getYear() == today.getYear() && fromDate.getMonth() == today.getMonth()&& fromDate.getDate() == today.getDate()){
		
		fromDate = today;		
		
	}

	var toDate = new Date(searchDate);		
	toDate.setHours(23);
	toDate.setMinutes(59);
	toDate.setSeconds(59);
	toDate.setMilliseconds(999);

	var myLong = parseFloat(searchLong);
	var myLat = parseFloat(searchLat);
	var fromDateISO = fromDate.toISOString();
	var toDateISO = toDate.toISOString();


	console.log('fromDateISO: ' + fromDateISO);
	console.log('toDateISO ' + toDateISO);

	var searchQuery = {  "idf_class_schedules.idf_display_standard_time": {$gte:new Date(fromDateISO)} };


	// 지역 조건 추가
	if(req.query.searchAreaId!=null && req.query.searchAreaId!=''){
		var idf_areaId_arr = req.query.searchAreaId.split(',');
		if(idf_areaId_arr.length == 1 )
			searchQuery["idf_areaId"] = idf_areaId_arr[0];
		else 
			searchQuery["idf_areaId"] =  {$in : idf_areaId_arr};
	}

	// 가맹점 조건 추가
	if(req.query.searchAccountId!=null && req.query.searchAccountId!=''){
		var searchAccountIdArr = req.query.searchAccountId.split(',');

		if(searchAccountIdArr.length==1){
			searchQuery["accountId"] = searchAccountIdArr[0];
		}else{
			searchQuery["accountId"] = {$in : searchAccountIdArr};
		}
		
	}

	// 대카테고리, 소카테고리 조건 추가
	if(req.query.searchSubCategoryId!=null && req.query.searchSubCategoryId!=''){
		if(req.query.searchCategoryId!=null && req.query.searchCategoryId!=''){
			if(req.query.searchFrom=='main'){
				searchQuery["idf_class_categoryId"] = req.query.searchCategoryId;
				searchQuery["idf_class_subCategories._id"] = {$in : req.query.searchSubCategoryId.split(',')};
				console.log('==대카테고리 및 소카테고리 있음 and 조건이로 묶임');
			}else{
				searchQuery["$or"] = [{"idf_class_subCategories._id" : {$in : req.query.searchSubCategoryId.split(',')}}, {"idf_class_categoryId": {$in : req.query.searchSubCategoryId.split(',')}}];
				console.log('==대카테고리 및 소카테고리 있음 OR 조건이로 묶임');
			}
		}else{
			searchQuery["idf_class_subCategories._id"] = {$in : req.query.searchSubCategoryId.split(',')};
		}
	}else if(req.query.searchCategoryId!=null && req.query.searchCategoryId!=''){
		searchQuery["idf_class_categoryId"] = {$in : req.query.searchCategoryId.split(',')};
	}
	
	searchLong	= parseFloat(searchLong);
	searchLat	= parseFloat(searchLat);

	var km = 10; // default 10km

	if(sortOption == 'distAsc'){ // 거리슌 일때

		km=1000;

	}

	/* 1/9 cms 추가 근방 xkm로 limit*/
	if(req.query.xkm!=null && req.query.xkm!=''){
		km = req.query.xkm;
	}

	var aggQuery = [
	    {
	      $geoNear: {
			near :  [searchLong,searchLat],
			distanceField: "dist_calculated",				
	        maxDistance: km/6371,
			query: searchQuery,
			distanceMultiplier: 6371,
			spherical: true,
			num: 10000

	      }
	    },{
	        $unwind: {
	            path: "$idf_class_schedules"
	        }
	    },{
	        $sort : { "idf_class_schedules.idf_display_standard_time" : 1 } 
	    },{
	        $match:{
	            "idf_class_schedules.idf_display_standard_time":  {$gte:new Date(fromDateISO)}
	        }
	    },{
	        $group: {
				"_id":{
					"idf_classId":"$_id",
					  "idf_name":"$idf_name",
					  "idf_class_categoryName":"$idf_class_categoryName",
					  "idf_class_subCategories":"$idf_class_subCategories", 
					  "idf_class_categoryId":"$idf_class_categoryId", 
					  "accountId":"$accountId",
					  "accountName":"$accountName",
					  "idf_accountGradeAvg":"$idf_accountGradeAvg",
					  "idf_represent_photo":"$idf_represent_photo",
					  "idf_longitude":"$idf_longitude", 
					  "idf_latitude":"$idf_latitude" , 
					  "idf_areaName":"$idf_areaName",
					  "idf_subway_line_1":"$idf_subway_line_1",
					  "idf_subway_line_2":"$idf_subway_line_2",
					  "idf_subway_line_3":"$idf_subway_line_3",
					  "idf_subway_line_4":"$idf_subway_line_4",
					  "idf_subwayname":"$idf_subwayname",
					  "idf_dong":"$idf_dong",
					  "idf_call_essential":"$idf_call_essential",
					  "distance":"$dist_calculated"  
				},
				"idf_class_schedules":{"$push":"$idf_class_schedules"},
				"idf_min_coin" : {$min : "$idf_class_schedules.idf_coin"},
				"idf_max_coin" : {$max : "$idf_class_schedules.idf_coin"},
				"idf_min_starttime" : {$min : "$idf_class_schedules.idf_starttime"}
			  }
	    },{
	        $group: {
				"_id":{
					"accountId":"$_id.accountId",
					"accountName":"$_id.accountName",
					"idf_represent_photo":"$_id.idf_represent_photo", 
					"idf_longitude":"$_id.idf_longitude", 
					"idf_latitude":"$_id.idf_latitude" , 
					"idf_areaName":"$_id.idf_areaName",
					"idf_subway_line_1":"$_id.idf_subway_line_1",
					"idf_subway_line_2":"$_id.idf_subway_line_2",
					"idf_subway_line_3":"$_id.idf_subway_line_3",
					"idf_subway_line_4":"$_id.idf_subway_line_4",
					"idf_subwayname":"$_id.idf_subwayname",
					"idf_dong":"$_id.idf_dong",
					"idf_call_essential":"$_id.idf_call_essential"
				},
				"idf_classes": { 
					"$push":{
						//"idf_classId":"$_id.idf_classId", 
						"idf_name":"$_id.idf_name", 
						//"idf_class_categoryName":"$_id.idf_class_categoryName", 
						//"idf_class_categoryId":"$_id.idf_class_categoryId", 
						"idf_class_subCategories":"$_id.idf_class_subCategories"//, 
						//"idf_min_coin" : "$idf_min_coin",
						//"idf_class_schedules":"$idf_class_schedules",
						//"idf_min_starttime" : "$idf_min_starttime"
					} 
				},
				"idf_min_coin" : {$min : "$idf_min_coin"},
				"idf_max_coin" : {$min : "$idf_max_coin"},
				"idf_min_starttime" : {$min : "$idf_min_starttime"},
				"distance" :{$avg:"$_id.distance"},
				"idf_accountGradeAvg":{$avg:"$_id.idf_accountGradeAvg"},
				"class_cnt" : {$sum : 1}
			  }
	    }
	    
	];


	if(sortOption == 'coinAsc'){ // 낮은 코인 슌

		aggQuery.push({$sort:{"idf_min_coin" : 1 , "distance" : 1}});

	}else if(sortOption == 'coinDesc'){ // 높은 코인 순

		aggQuery.push({$sort:{"idf_min_coin" : -1 , "distance" : 1}});

	}else if(sortOption == 'gradeDesc'){ // 높은 별점 순

		aggQuery.push({$sort:{"_id.idf_accountGradeAvg" : -1 , "distance" : 1}});

	}else if(sortOption == 'distAsc'){ // 낮은 거리 순

		aggQuery.push({$sort:{"distance" : 1 }});

	}
	console.log(JSON.stringify(aggQuery));

	db.collection('searchcaches'+searchDate).aggregate(aggQuery, function(err, result){ 
		if(err){
			res.json({"message" : err});
			console.log(err);
		}
		else {
			if(req.query.searchFrom=='areaMap' && req.query.searchAreaId!=null ){
				db.collection('searchcaches'+searchDate).aggregate([
					{
					   $match:{
							"idf_areaId" : {$in : req.query.searchAreaId.split(',')},"idf_class_schedules.idf_display_standard_time":  {$gte:new Date(fromDateISO)}
						}
					},{
						$unwind: {
							path: "$idf_class_schedules"
						}
					},{
						$group: { _id: {"accountId":"$accountId", "idf_areaId":"$idf_areaId", "idf_areaName":"$idf_areaName"}}
					},{
						$group: { _id: {"idf_areaId":"$_id.idf_areaId", "idf_areaName":"$_id.idf_areaName"}, "count": { "$sum": 1 }}
					},{
						$lookup: {
							"from" : "areas",
							"localField" : "_id.idf_areaId",
							"foreignField" : "_id",
							"as" : "idf_areaInfo"
						}
					}
				], function(err, resultCountByArea){
					if(err) 
						res.json({"message" : err, "searchResult":result});
					else
						res.json({"searchInfo":"", "searchResult":result, "resultCountByArea":resultCountByArea});
				});
			}else{
				res.json({"searchInfo":"", "searchResult":result});
			}
		}
	});

});

/*************************************************
Account 리스트 조회
required(param) : searchLong
                  searchLat
				  searchDate
				  sortOption
				  page
				  pageSize
optional(query) : searchAreaId
                  searchAccountId
                  searchCategoryId
                  searchSubCategoryId
				  searchFrom:main

*************************************************/
router.route('/searchAccountList/:searchLong,:searchLat/:searchDate/:sortOption/:pageSize/:page').get(function(req, res) {


	var searchLong	= req.params.searchLong!= null ? req.params.searchLong : '';
	var searchLat	= req.params.searchLat != null ? req.params.searchLat : '';
	var searchDate	= req.params.searchDate != null ? req.params.searchDate : '';
	var sortOption	= req.params.sortOption != null ? req.params.sortOption : '';
	var pageSize	= req.params.pageSize != null ? req.params.pageSize : '';
	var page		= req.params.page != null ? req.params.page : '';

	console.log('searchLong: ' + searchLong);
	console.log('searchLat: ' + searchLat);
	console.log('searchDate: ' + searchDate);
	console.log('sortOption: ' + sortOption);
	console.log('pageSize: ' + pageSize);
	console.log('page: ' + page);

	var searchErr = '';
	if(searchLong == ''){
		searchErr += 'searchLong is null.\n';
	}
	if(searchLat == '' ){
		searchErr += 'searchLat is null.\n';
	}
	if(searchDate == '' ){
		searchErr += 'searchDate is null.\n';
	}
	if(sortOption == '' ){
		searchErr += 'sortOption is null.\n';
	}
	if(pageSize == '' ){
		searchErr += 'pageSize is null.\n';
	}
	if(page == '' ){
		searchErr += 'page is null.\n';
	}

	if(searchErr!=''){
		console.log(searchErr);
		res.json({"searchErr" : searchErr});
		return;
			
	}


	var fromDate = new Date(searchDate);
	fromDate.setHours(0);
	fromDate.setMinutes(0);
	fromDate.setSeconds(0);
	fromDate.setMilliseconds(0);

	var today = new Date();
	if(fromDate.getYear() == today.getYear() && fromDate.getMonth() == today.getMonth()&& fromDate.getDate() == today.getDate()){
		
		fromDate = today;		
		
	}

	var toDate = new Date(searchDate);		
	toDate.setHours(23);
	toDate.setMinutes(59);
	toDate.setSeconds(59);
	toDate.setMilliseconds(999);

	var fromDateISO = fromDate.toISOString();
	var toDateISO = toDate.toISOString();


	console.log('fromDateISO: ' + fromDateISO);
	console.log('toDateISO ' + toDateISO);

	var searchQuery = {  "idf_class_schedules.idf_display_standard_time": {$gte:new Date(fromDateISO)} };


	// 지역 조건 추가
	if(req.query.searchAreaId!=null && req.query.searchAreaId!=''){
		var idf_areaId_arr = req.query.searchAreaId.split(',');
		console.log('idf_areaId_arr.length: ' + idf_areaId_arr.length);
		if(idf_areaId_arr.length == 1 )
			searchQuery["idf_areaId"] = idf_areaId_arr[0];
		else 
			searchQuery["idf_areaId"] =  {$in : idf_areaId_arr};

		console.log('searchAreaId ' + req.query.searchAreaId);
	}

	// 가맹점 조건 추가
	if(req.query.searchAccountId!=null && req.query.searchAccountId!=''){
		searchQuery["accountId"] = req.query.searchAccountId;
	}

	// 대카테고리, 소카테고리 조건 추가
	if(req.query.searchSubCategoryId!=null && req.query.searchSubCategoryId!=''){
		if(req.query.searchCategoryId!=null && req.query.searchCategoryId!=''){
			if(req.query.searchFrom=='main'){
				searchQuery["idf_class_categoryId"] = req.query.searchCategoryId;
				searchQuery["idf_class_subCategories._id"] = {$in : req.query.searchSubCategoryId.split(',')};
				console.log('==대카테고리 및 소카테고리 있음 and 조건이로 묶임');
			}else{
				searchQuery["$or"] = [{"idf_class_subCategories._id" : {$in : req.query.searchSubCategoryId.split(',')}}, {"idf_class_categoryId": {$in : req.query.searchSubCategoryId.split(',')}}];
				console.log('==대카테고리 및 소카테고리 있음 OR 조건이로 묶임');
			}
		}else{
			searchQuery["idf_class_subCategories._id"] = {$in : req.query.searchSubCategoryId.split(',')};
		}
	}else if(req.query.searchCategoryId!=null && req.query.searchCategoryId!=''){
		searchQuery["idf_class_categoryId"] = {$in : req.query.searchCategoryId.split(',')};
	}
	
	searchLong	= parseFloat(searchLong);
	searchLat	= parseFloat(searchLat);

	var aggQuery = [
	    {
	      $geoNear: {
			near :  [searchLong,searchLat],
			distanceField: "dist_calculated",
			query: searchQuery,
			distanceMultiplier: 6371,
			spherical: true,
			num: 10000

	      }
	    },{
	        $unwind: {
	            path: "$idf_class_schedules"
	        }
	    },{
	        $sort : { "idf_class_schedules.idf_display_standard_time" : 1 } 
	    },{
	        $match:{
	            "idf_class_schedules.idf_display_standard_time":  {$gte:new Date(fromDateISO)}
	        }
	    },{
	        $group: {
				"_id":{
					"idf_classId":"$_id",
					  "idf_name":"$idf_name",
					  "idf_class_categoryName":"$idf_class_categoryName",
					  "idf_class_subCategories":"$idf_class_subCategories", 
					  "idf_class_categoryId":"$idf_class_categoryId", 
					  "accountId":"$accountId",
					  "accountName":"$accountName",
					  "idf_accountGradeAvg":"$idf_accountGradeAvg",
					  "idf_represent_photo":"$idf_represent_photo",
					  "idf_longitude":"$idf_longitude", 
					  "idf_latitude":"$idf_latitude" , 
					  "idf_areaName":"$idf_areaName",
					  "distance":"$dist_calculated"  
				},				
				"idf_class_schedules":{"$push":"$idf_class_schedules"},
				"idf_min_coin" : {$min : "$idf_class_schedules.idf_coin"},
				"idf_max_coin" : {$max : "$idf_class_schedules.idf_coin"},
				"idf_min_starttime" : {$min : "$idf_class_schedules.idf_starttime"}
			  }
	    },{
	        $group: {
				"_id":{
					"accountId":"$_id.accountId",
					"accountName":"$_id.accountName",
					"idf_represent_photo":"$_id.idf_represent_photo", 
					"idf_longitude":"$_id.idf_longitude", 
					"idf_latitude":"$_id.idf_latitude" , 
					"idf_areaName":"$_id.idf_areaName"
				},
				"idf_classes": { 
					"$push":{
						//"idf_classId":"$_id.idf_classId", 
						"idf_name":"$_id.idf_name", 
						//"idf_class_categoryName":"$_id.idf_class_categoryName", 
						//"idf_class_categoryId":"$_id.idf_class_categoryId", 
						"idf_class_subCategories":"$_id.idf_class_subCategories"//, 
						//"idf_min_coin" : "$idf_min_coin",
						//"idf_class_schedules":"$idf_class_schedules",
						//"idf_min_starttime" : "$idf_min_starttime"
					} 
				},
				//"idf_class_subCategories" : { "$push" : {"_id":"$_id.idf_class_subCategories._id",  "idf_name":"$_id.idf_class_subCategories.idf_name"}},
				"idf_min_coin" : {$min : "$idf_min_coin"},
				"idf_max_coin" : {$min : "$idf_max_coin"},
				"idf_min_starttime" : {$min : "$idf_min_starttime"},
				"distance" :{$avg:"$_id.distance"},
				"idf_accountGradeAvg":{$avg:"$_id.idf_accountGradeAvg"},
				"class_cnt" : {$sum : 1}
			  }
	    }
	    
	];

	if(sortOption == 'coinAsc'){ // 낮은 코인 슌

		aggQuery.push({$sort:{"idf_min_coin" : 1 }});

	}else if(sortOption == 'coinDesc'){ // 높은 코인 순

		aggQuery.push({$sort:{"idf_min_coin" : -1 }});

	}else if(sortOption == 'gradeDesc'){ // 높은 별점 순

		aggQuery.push({$sort:{"_id.idf_accountGradeAvg" : -1 }});

	}else if(sortOption == 'distAsc'){ // 낮은 거리 순

		aggQuery.push({$sort:{"distance" : 1 }});

	}



	var pageInt = parseInt(page);
	var pageSizeInt = parseInt(pageSize);

	aggQuery.push({ $skip : (pageInt-1)*pageSizeInt });
	aggQuery.push({ $limit : pageSizeInt});

	console.log(JSON.stringify(aggQuery));

	db.collection('searchcaches'+searchDate).aggregate(aggQuery, function(err, result){ 
		if(err){
			res.json({"message" : err});
			console.log(err);
		}
		else {
			res.json({"searchInfo":{"page":page, "pageSize":pageSize}, "searchResult":result});
		}
	});

});

// 지도용
/*************************************************
Account 리스트 지도 조회
required(param) : searchLong
                  searchLat
				  searchDate
optional(query) : searchAreaId
                  searchAccountId
                  searchCategoryId
                  searchSubCategoryId
				  searchFrom:areaMap

*************************************************/
router.route('/searchAccountMap/:searchLong,:searchLat/:searchDate').get(function(req, res) {


	var searchLong	= req.params.searchLong!= null ? req.params.searchLong : '';
	var searchLat	= req.params.searchLat != null ? req.params.searchLat : '';
	var searchDate	= req.params.searchDate != null ? req.params.searchDate : '';

	console.log('searchLong: ' + searchLong);
	console.log('searchLat: ' + searchLat);
	console.log('searchDate: ' + searchDate);

	var searchErr = '';
	if(searchLong == ''){
		searchErr += 'searchLong is null.\n';
	}
	if(searchLat == '' ){
		searchErr += 'searchLat is null.\n';
	}
	if(searchDate == '' ){
		searchErr += 'searchDate is null.\n';
	}

	if(searchErr!=''){
		console.log(searchErr);
		res.json({"searchErr" : searchErr});
		return;
			
	}


	var fromDate = new Date(searchDate);
	fromDate.setHours(0);
	fromDate.setMinutes(0);
	fromDate.setSeconds(0);
	fromDate.setMilliseconds(0);

	var today = new Date();
	if(fromDate.getYear() == today.getYear() && fromDate.getMonth() == today.getMonth()&& fromDate.getDate() == today.getDate()){
		
		fromDate = today;		
		
	}

	var toDate = new Date(searchDate);		
	toDate.setHours(23);
	toDate.setMinutes(59);
	toDate.setSeconds(59);
	toDate.setMilliseconds(999);

	var myLong = parseFloat(searchLong);
	var myLat = parseFloat(searchLat);
	var fromDateISO = fromDate.toISOString();
	var toDateISO = toDate.toISOString();


	console.log('fromDateISO: ' + fromDateISO);
	console.log('toDateISO ' + toDateISO);

	var searchQuery = {  "idf_class_schedules.idf_display_standard_time": {$gte:new Date(fromDateISO)} };


	// 지역 조건 추가
	if(req.query.searchAreaId!=null && req.query.searchAreaId!=''){
		var idf_areaId_arr = req.query.searchAreaId.split(',');
		if(idf_areaId_arr.length == 1 )
			searchQuery["idf_areaId"] = idf_areaId_arr[0];
		else 
			searchQuery["idf_areaId"] =  {$in : idf_areaId_arr};
	}

	// 가맹점 조건 추가
	if(req.query.searchAccountId!=null && req.query.searchAccountId!=''){
		searchQuery["accountId"] = req.query.searchAccountId;
	}

	// 대카테고리, 소카테고리 조건 추가
	if(req.query.searchSubCategoryId!=null && req.query.searchSubCategoryId!=''){
		if(req.query.searchCategoryId!=null && req.query.searchCategoryId!=''){
			if(req.query.searchFrom=='main'){
				searchQuery["idf_class_categoryId"] = req.query.searchCategoryId;
				searchQuery["idf_class_subCategories._id"] = {$in : req.query.searchSubCategoryId.split(',')};
				console.log('==대카테고리 및 소카테고리 있음 and 조건이로 묶임');
			}else{
				searchQuery["$or"] = [{"idf_class_subCategories._id" : {$in : req.query.searchSubCategoryId.split(',')}}, {"idf_class_categoryId": {$in : req.query.searchSubCategoryId.split(',')}}];
				console.log('==대카테고리 및 소카테고리 있음 OR 조건이로 묶임');
			}
		}else{
			searchQuery["idf_class_subCategories._id"] = {$in : req.query.searchSubCategoryId.split(',')};
		}
	}else if(req.query.searchCategoryId!=null && req.query.searchCategoryId!=''){
		searchQuery["idf_class_categoryId"] = {$in : req.query.searchCategoryId.split(',')};
	}
	
	searchLong	= parseFloat(searchLong);
	searchLat	= parseFloat(searchLat);

	var aggQuery = [
	    {
	      $geoNear: {
			near :  [searchLong,searchLat],
			distanceField: "dist_calculated",
			query: searchQuery,
			distanceMultiplier: 6371,
			spherical: true,
			num: 10000

	      }
	    },{
	        $unwind: {
	            path: "$idf_class_schedules"
	        }
	    },{
	        $sort : { "idf_class_schedules.idf_display_standard_time" : 1 } 
	    },{
	        $match:{
	            "idf_class_schedules.idf_display_standard_time":  {$gte:new Date(fromDateISO)}
	        }
	    },{
	        $group: {
				"_id":{
					"idf_classId":"$_id",
					  "idf_name":"$idf_name",
					  "idf_class_categoryName":"$idf_class_categoryName",
					  "idf_class_subCategories":"$idf_class_subCategories", 
					  "idf_class_categoryId":"$idf_class_categoryId", 
					  "accountId":"$accountId",
					  "accountName":"$accountName",
					  "idf_accountGradeAvg":"$idf_accountGradeAvg",
					  "idf_represent_photo":"$idf_represent_photo",
					  "idf_longitude":"$idf_longitude", 
					  "idf_latitude":"$idf_latitude" , 
					  "idf_areaName":"$idf_areaName",
					  "distance":"$dist_calculated"  
				},
				"idf_class_schedules":{"$push":"$idf_class_schedules"},
				"idf_min_coin" : {$min : "$idf_class_schedules.idf_coin"},
				"idf_max_coin" : {$max : "$idf_class_schedules.idf_coin"},
				"idf_min_starttime" : {$min : "$idf_class_schedules.idf_starttime"}
			  }
	    },{
	        $group: {
				"_id":{
					"accountId":"$_id.accountId",
					"accountName":"$_id.accountName",
					"idf_represent_photo":"$_id.idf_represent_photo", 
					"idf_longitude":"$_id.idf_longitude", 
					"idf_latitude":"$_id.idf_latitude" , 
					"idf_areaName":"$_id.idf_areaName"
				},
				"idf_classes": { 
					"$push":{
						//"idf_classId":"$_id.idf_classId", 
						"idf_name":"$_id.idf_name", 
						//"idf_class_categoryName":"$_id.idf_class_categoryName", 
						//"idf_class_categoryId":"$_id.idf_class_categoryId", 
						"idf_class_subCategories":"$_id.idf_class_subCategories"//, 
						//"idf_min_coin" : "$idf_min_coin",
						//"idf_class_schedules":"$idf_class_schedules",
						//"idf_min_starttime" : "$idf_min_starttime"
					} 
				},
				"idf_min_coin" : {$min : "$idf_min_coin"},
				"idf_max_coin" : {$min : "$idf_max_coin"},
				"idf_min_starttime" : {$min : "$idf_min_starttime"},
				"distance" :{$avg:"$_id.distance"},
				"idf_accountGradeAvg":{$avg:"$_id.idf_accountGradeAvg"},
				"class_cnt" : {$sum : 1}
			  }
	    }
	    
	];


	console.log(JSON.stringify(aggQuery));

	db.collection('searchcaches'+searchDate).aggregate(aggQuery, function(err, result){ 
		if(err){
			res.json({"message" : err});
			console.log(err);
		}
		else {
			if(req.query.searchFrom=='areaMap' && req.query.searchAreaId!=null ){
				db.collection('searchcaches'+searchDate).aggregate([
					{
					   $match:{
							"idf_areaId" : {$in : req.query.searchAreaId.split(',')},"idf_class_schedules.idf_display_standard_time":  {$gte:new Date(fromDateISO)}
						}
					},{
						$unwind: {
							path: "$idf_class_schedules"
						}
					},{
						$group: { _id: {"accountId":"$accountId", "idf_areaId":"$idf_areaId", "idf_areaName":"$idf_areaName"}}
					},{
						$group: { _id: {"idf_areaId":"$_id.idf_areaId", "idf_areaName":"$_id.idf_areaName"}, "count": { "$sum": 1 }}
					}
				], function(err, resultCountByArea){
					if(err) 
						res.json({"message" : err, "searchResult":result});
					else
						res.json({"searchInfo":"", "searchResult":result, "resultCountByArea":resultCountByArea});
				});
			}else{
				res.json({"searchInfo":"", "searchResult":result});
			}
		}
	});

});

router.route('/searchClassListByAccount/:searchDate/:searchAccountId/').get(function(req, res) {

	var searchAccountId	= req.params.searchAccountId != null ? req.params.searchAccountId : '';
	var searchDate	= req.params.searchDate != null ? req.params.searchDate : '';

	console.log('searchDate: ' + searchDate);
	console.log('searchAccountId: ' + searchAccountId);

	var searchErr = '';
	if(searchDate == ''){
		searchErr += 'searchDate is null.\n';
	}
	if(searchAccountId == '' ){
		searchErr += 'searchAccountId is null.\n';
	}

	if(searchErr!=''){
		console.log(searchErr);
		res.json({"searchErr" : searchErr});
		return;
			
	}


	var fromDate = new Date(searchDate);
	fromDate.setHours(0);
	fromDate.setMinutes(0);
	fromDate.setSeconds(0);
	fromDate.setMilliseconds(0);

	var today = new Date();
	if(fromDate.getYear() == today.getYear() && fromDate.getMonth() == today.getMonth()&& fromDate.getDate() == today.getDate()){
		
		fromDate = today;		
		
	}

	var toDate = new Date(searchDate);		
	toDate.setHours(23);
	toDate.setMinutes(59);
	toDate.setSeconds(59);
	toDate.setMilliseconds(999);


	var fromDateISO = fromDate.toISOString();
	var toDateISO = toDate.toISOString();


	console.log('fromDateISO: ' + fromDateISO);
	console.log('toDateISO ' + toDateISO);

	var searchQuery = {  "idf_class_schedules.idf_display_standard_time": {$gte:new Date(fromDateISO)} };

	// 가맹점 조건 추가
	searchQuery["accountId"] = searchAccountId;
	
	// 대카테고리, 소카테고리 조건 추가
	if(req.query.searchSubCategoryId!=null && req.query.searchSubCategoryId!=''){
		if(req.query.searchCategoryId!=null && req.query.searchCategoryId!=''){
			if(req.query.searchFrom=='main'){
				searchQuery["idf_class_categoryId"] = req.query.searchCategoryId;
				searchQuery["idf_class_subCategories._id"] = {$in : req.query.searchSubCategoryId.split(',')};
				console.log('==대카테고리 및 소카테고리 있음 and 조건이로 묶임');
			}else{
				searchQuery["$or"] = [{"idf_class_subCategories._id" : {$in : req.query.searchSubCategoryId.split(',')}}, {"idf_class_categoryId": {$in : req.query.searchSubCategoryId.split(',')}}];
				console.log('==대카테고리 및 소카테고리 있음 OR 조건이로 묶임');
			}
		}else{
			searchQuery["idf_class_subCategories._id"] = {$in : req.query.searchSubCategoryId.split(',')};
		}
	}else if(req.query.searchCategoryId!=null && req.query.searchCategoryId!=''){
		searchQuery["idf_class_categoryId"] = {$in : req.query.searchCategoryId.split(',')};
	}




	var aggQuery = [
		{
	        $match: searchQuery
	    },{
			$project:{
				_id : 1,
				idf_name: 1,
				accountName: 1
			}
            
		}
	    
	];

	db.collection('searchcaches'+searchDate).aggregate(aggQuery, function(err, result){ 
		if(err){
			res.json({"message" : err});
			console.log(err);
		}
		else {
			res.json({"searchResult":result});
		}
	});


	console.log(JSON.stringify(aggQuery));

});


app.use('/',router);

var options = {
	cert: fs.readFileSync('certs/STAR.u815.co.kr.pfx.crt'),
	key: fs.readFileSync('certs/STAR.u815.co.kr.pfx.key')
};

https.createServer(options, app).listen(18899, function(){
	console.log("독립운동 검색 API v2.0 입니다. Port:18899");
});

