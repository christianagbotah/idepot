<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Sms_model extends CI_Model {
    
    public function __construct() {
        parent::__construct();
    }
    
    function clear_cache() {
        $this->output->set_header('Cache-Control: no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
        $this->output->set_header('Pragma: no-cache');
    }

    //COMMON FUNCTION FOR SENDING SMS
    function send_sms($message = '' , $receiver_phone = array(), $user_name = array())
    {
    

        $counter = 0;
        $data_success = array();
        $data_fail = array();
    
        $active_sms_service = $this->db->get_where('settings' , array(
            'type' => 'active_sms_service'
        ))->row()->description;


        if ($active_sms_service == '' || $active_sms_service == 'disabled')
            return;
        if ($active_sms_service == 'hubtel') {

    
            $hubtel_sender   = $this->db->get_where('settings', array('type' => 'hubtel_sender'))->row()->description;
            $hubtel_client_id       = $this->db->get_where('settings', array('type' => 'hubtel_client_id'))->row()->description;
            $hubtel_client_secret     = $this->db->get_where('settings', array('type' => 'hubtel_client_secret'))->row()->description;
            
    
            if(substr($message, 0, 7) == 'Welcome') {
                $text   = $message.' Kindly change your password on your first login.'."\r\n".'Please use this link to login: ' . base_url();
            } else {
                $text   = $message;
            }
            $from   = $hubtel_sender;
            
            
            
            function getToken($clientId, $clientSecret){
                return base64_encode("$clientId:$clientSecret");
            }
            
            function SendMessage($messageRequest = array(), $clientId = "", $clientSecret= ""){
                $curl = curl_init();
            
                curl_setopt_array($curl, array(
                CURLOPT_URL => "https://sms.hubtel.com/v1/messages/batch/simple/send",
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_ENCODING => "",
                CURLOPT_MAXREDIRS => 10,
                CURLOPT_TIMEOUT => 0,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => "POST",
                CURLOPT_POSTFIELDS => json_encode($messageRequest),
                CURLOPT_HTTPHEADER => array(
                    "Authorization: Basic ".getToken($clientId, $clientSecret),
                    "Content-Type: application/json"
                ),
                ));
            
                $exc = curl_exec($curl);
                $err = curl_error($curl);

                if($err) {
                    $response = $err;
                } else {
                    $response = $exc;
                }
                
                return json_decode($response, true);
                
                curl_close($curl);
            }
            
            
            $clientId = $hubtel_client_id;
            $clientSecret = $hubtel_client_secret;

            $correct_numbers_array = array();
            $invalid_numbers_array = array();
            $correct_names_array = array();
            $invalid_names_array = array();
            
            //Sample usage
            $is_invalid = false;
            for($p=0; $p < count($receiver_phone); $p++) {
                
                if(strlen($receiver_phone[$p]) == 9 && substr($receiver_phone[$p], 0, 1) != '0') {
                    $to     = '+233'. substr($receiver_phone[$p], 0, 9);

                } else if(strlen($receiver_phone[$p]) == 10 && substr($receiver_phone[$p], 0, 1) == '0') {
                    $to     = '+233'. substr($receiver_phone[$p], 1, 9);

                } else if(strlen($receiver_phone[$p]) == 12) {
                    $to     = '+'. $receiver_phone[$p];

                } else if(strlen($receiver_phone[$p]) == 13 && substr($receiver_phone[$p], 3, 1) == 0) {
                    $to     = '+233'. substr($receiver_phone[$p], 4, 9);

                } else if(strlen($receiver_phone[$p]) == 14 && substr($receiver_phone[$p], 4, 1) == 0 && substr($receiver_phone[$p], 0, 1) == '+') {
                    $to     = '+233'. substr($receiver_phone[$p], 5, 9);

                } else if(strlen($receiver_phone[$p]) == 13 && substr($receiver_phone[$p], 0, 1) == '+') {
                    $to     = $receiver_phone[$p];

                } else {

                    array_push($invalid_numbers_array, $receiver_phone[$p]);

                    if(count($user_name) < 1) { 
                        array_push($invalid_names_array, $receiver_phone[$p]);
                    } else {
                        array_push($invalid_names_array, $user_name[$p]);
                    }
                    
                   continue;
                }

                $name = '<button class="btn btn-default" style="padding: 3px">'.ucwords(strtolower($user_name[$p])).' - '.$to.'</button>';
                array_push($correct_numbers_array, $to);
                array_push($correct_names_array, $name);

            }

            
            
            if(!empty($invalid_numbers_array)) {
                //invlid numbers detected
                if(count($user_name) < 1) { 
                    return get_phrase('THE FOLLOWING RECIPIENT(S) PHONE NUMBER(S) ARE INVALID: '.implode(', ', $invalid_numbers_array).'!<br><br> PLEASE CHECK AND CORRECT THEM BEFORE PROCEEDING.');
                } else {
                    return get_phrase('THE FOLLOWING RECIPIENT(S) PHONE NUMBER(S) ARE INVALID: '.implode(', ', $correct_names_array).'!<br><br> PLEASE CHECK AND CORRECT THEM BEFORE PROCEEDING.');
                }
                

            } else {
                //all numbers are correct
                //for($c = 0; $c < count($correct_numbers_array); $c++) {

                    $messageRequest = [
                        "From" => $hubtel_sender,
                        "Recipients" => $correct_numbers_array,
                        "Content" => $text,
                    ];
                    
                    $response = SendMessage($messageRequest, $clientId, $clientSecret);
                    $send_sms_response = $response;
                    
                  
                if(substr($message, 0, 7) == 'Welcome') { 

                    return;
                } else {
                    //send response
                    if($send_sms_response['status'] == 0) {
                         $finalResponse = '<h2 style="margin-top: -30px;"><button type="button" class="btn btn-success btn-lg" style="border-radius: 5px !important;">Total Recipient(s): <span class="badge">'.count($correct_numbers_array).'</span></button></h2><h4>SMS Successfully sent to the following:</h4>'. implode(', ', $correct_names_array);

                        return $finalResponse;

                    } else {
                        return 'failed';
                    }                 
                }
            }
                
        }
    }
}
