<?php
//**ITEMS TRANSFERS CREATION, UPDATES AND DELETION**/
    function items_transfer($param1 = '', $param2 = '', $param3 = '', $param4 = '') {
        if ($this->session->userdata('admin_login') != 1) {
            redirect(site_url('login'), 'refresh');
        }

        //get form data
        if ($param1 == 'create') {

            //Track errors and success
            $errors = array();
            $ajax_data = array();

            //imported ids array
            $input_ids_numeric = explode('-', $param2);

            //FOR ITEMS TRANSFERS TABLE
            $items_tranfers_create_data['token_no'] = $this->input->post('token_no');
            $items_tranfers_create_data['receiver'] = $this->input->post('transfer_to');
            $items_tranfers_create_data['date_timestamp'] = strtotime($this->input->post('transfer_date'));
            $items_tranfers_create_data['timestamp'] = strtotime(date('d-m-Y H:i:s'));
            $items_tranfers_create_data['date'] = $this->input->post('transfer_date');
            $items_tranfers_create_data['sales_person_id'] = $this->session->userdata('login_user_id');


            //check if any required field is empty
            if (empty($items_tranfers_create_data['token_no'])) {
                $errors['token_no'] = 'SO Number cannot be empty';
            }

            if (empty($items_tranfers_create_data['receiver'])) {
                $errors['receiver'] = 'You must select the receiver of the item(s)';
            }

            if (empty($items_tranfers_create_data['date'])) {
                $errors['date'] = 'Transfer Date cannot be empty';
            }


            //check if quantity picked is more than total quantity
            $s_counter = 0;
            $t_item_ids = array();
            $s_counter2 = 0;
            $t_item_ids2 = array();
            for ($i = 0; $i < sizeof($input_ids_numeric); $i++) {
                $t_quantity = $this->input->post('quantity_transferred_' . $input_ids_numeric[$i]);

                $t_item_id = $this->input->post('item_transferred_' . $input_ids_numeric[$i]);

                $quantity_left = $this->db->get_where('items', array('item_id' => $t_item_id))->row()->quantity;

                if($t_quantity > $quantity_left) {
                    $s_counter2++;
                    array_push($t_item_ids2, $this->db->get_where('items', array('item_id' => $t_item_id))->row()->item_name);
                }

            }


            if($s_counter2 > 0) {
                $errors['stock'] = 'Some items or goods are runnning out of stock. The quantity left is not enough for this transfer.';
                //$errors['item_ids'] = $t_item_ids2
            }

                if (!empty($errors)) {
                    //error found, let's notify the user of it
                    $ajax_data = $errors;
                    echo json_encode($ajax_data);
                } else {

                    //collect data for each item bought
                    for ($i = 0; $i < sizeof($input_ids_numeric); $i++) {

                        $items_tranfers_create_data['quantity'] = $this->input->post('quantity_transferred_' . $input_ids_numeric[$i]);

                        $items_tranfers_create_data['item_id'] = $this->input->post('item_transferred_' . $input_ids_numeric[$i]);

                        $items_tranfers_create_data['html_id'] = $input_ids_numeric[$i];

                        $items_tranfers_create_data['total_quantity'] = $this->input->post('hidden_total_quantity');


                        //check if any required field is empty
                        if (empty($items_tranfers_create_data['quantity'])) {
                            $errors['quantity'] = 'Quantity transferred cannot be empty';
                        }

                        if (empty($items_tranfers_create_data['item_id'])) {
                            $errors['item_id'] = 'You must select an Item';
                        }

                        //if there's error
                        if (!empty($errors)) {
                            //error found, let's notify the user of it
                            $ajax_data = $errors;
                            echo json_encode($ajax_data);
                        } else {
                            //No error found, now we can insert data
                            $this->db->insert('items_transfers', $items_tranfers_create_data);

                            //get s order id
                            $t_id = $this->db->insert_id();

                            //update item table
                            $item_data['quantity'] = $this->input->post('quantity_transferred_' . $input_ids_numeric[$i]);
                            $item_data['last_used_timestamp'] = strtotime($this->input->post('transfer_date2'));
                            $item_id = $this->input->post('item_transferred_' . $input_ids_numeric[$i]);
                            
                            //do update now
                            $this->db->where('item_id', $item_id);
                            $this->db->set('last_used_timestamp', $item_data['last_used_timestamp']);
                            $this->db->set('quantity', 'quantity - ' . $item_data['quantity'], FALSE);
                            $this->db->update('items');

                        }
                    } //End of loop

                    if (empty($errors)) {

                        //FOR GENERAL JOURNAL ENTRY (RECEIVER) DEBIT THIS
                        $journal_data_rc['timestamp'] = strtotime($this->input->post('transfer_date'));
                        $journal_data_rc['date_timestamp'] = strtotime(date('d-m-Y H:i:s'));
                        $journal_data_rc['date'] = $this->input->post('transfer_date');
                        $journal_data_rc['item_transfer_receiver'] = $this->input->post('transfer_to');
                        $journal_data_rc['journal'] = 'Item Transfer';
                        $journal_data_rc['debit_amount'] = $this->input->post('hidden_total_quantity');
                        $journal_data_rc['reference'] = '';
                        $journal_data_rc['description'] = 'Item(s) Transferred to '. $journal_data_rc['item_transfer_receiver'];
                        $journal_data_rc['sales_person_id'] = $this->session->userdata('login_user_id');

                        //INSERT NOW
                        $this->db->insert('general_journal', $journal_data_rc);

                        //FOR GENERAL JOURNAL ENTRY (ITEM) CREDIT THIS
                        $journal_data_it['timestamp'] = strtotime($this->input->post('transfer_date'));
                        $journal_data_it['date_timestamp'] = strtotime(date('d-m-Y H:i:s'));
                        $journal_data_it['date'] = $this->input->post('transfer_date');
                        $journal_data_it['token_no'] = $this->input->post('token_no');
                        $journal_data_it['journal'] = 'Item Transfer';
                        $journal_data_it['credit_amount'] = $this->input->post('hidden_total_quantity');
                        $journal_data_it['reference'] = '';
                        $journal_data_it['description'] = 'Item(s) Transferred to '. $journal_data_it['item_transfer_receiver'];
                        $journal_data_it['sales_person_id'] = $this->session->userdata('login_user_id');

                        //INSERT NOW
                        $this->db->insert('general_journal', $journal_data_it);

                        
                        ////return now
                        $ajax_data['success'] = true;
                        echo json_encode($ajax_data);
                    }
                }

        }

        //Editing SALES ORDER here
        if ($param1 == 'update') {
            $token_no = $token_no;

            //$paid_data['track_code'] = substr(sha1(md5(mt_rand(1034200000, strtotime(date('d-m-Y H:i:s'))))), 0, 15);

            //Track errors and success
            $errors = array();
            $ajax_data = array();

            $_items_ids = array();

            //No update after a day
            $timestamp = $this->db->get_where('items_transfers', array('token_no' => $token_no))->row()->date_timestamp;
            $today = strtotime(date('d-m-Y'));

            //imported ids array
            $input_ids_numeric = explode('-', $param3);

            //FOR ITEMS TRANSFER TABLE
            $items_tranfers_create_data['receiver'] = $this->input->post('transfer_to');
            $items_tranfers_create_data['timestamp'] = strtotime(date('d-m-Y H:i:s'));
            //$items_tranfers_create_data['date_timestamp'] = strtotime($this->input->post('order_date'));
            //$items_tranfers_create_data['date'] = $this->input->post('order_date');
            $items_tranfers_create_data['sales_person_id'] = $this->session->userdata('login_user_id');


            //get previous prev_paid amount from the accounts_payable table
            //$prev_paid['prev_paid'] = $this->db->get_where('invoice', array('token_no' => $token_no, 'customer_id' => $items_tranfers_create_data['customer_id']))->row()->prev_paid;

            //get the earlier balance and subtract it before effecting the new update
            //$receivable_adjust_paid['current_balance'] = $this->db->get_where('items_transfers', array('token_no' => $token_no))->row()->amount_paid;
            //$receivable_adjust['current_balance'] = $this->db->get_where('items_transfers', array('token_no' => $token_no))->row()->grand_total;

            //check if any required field is empty

                if($timestamp != $today) {
                    $errors['outdated'] = 'Sorry! You cannot edit an entry that is a day old. Contact your system Administrator.';
                }

                if (empty($items_tranfers_create_data['transfer_to'])) {
                    $errors['transfer_to'] = 'You must select the receiver of the transfer';
                }


            //check if quantity picked is more than total quantity
            $s_counter = 0;
            $t_item_ids = array();
            $s_counter2 = 0;
            $t_item_ids2 = array();
            for ($i = 0; $i < sizeof($input_ids_numeric); $i++) {
                $t_quantity = $this->input->post('quantity_transferred_' . $input_ids_numeric[$i]);

                $t_item_id = $this->input->post('item_transferred_' . $input_ids_numeric[$i]);

                //previous quantity
                $t_quantity_prev = $this->db->get_where('items_transfers', array('token_no' => $token_no, 'item_id' => $t_item_id))->row()->quantity;

                $actual_item_q =  $t_quantity - $t_quantity_prev;

                $quantity_left = $this->db->get_where('items', array('item_id' => $t_item_id))->row()->quantity;

                if($actual_item_q > $quantity_left) {
                    $s_counter2++;
                    array_push($t_item_ids2, $this->db->get_where('items', array('item_id' => $t_item_id))->row()->item_name);
                }

            }


            if($s_counter2 > 0) {
                $errors['stock'] = 'Some items or goods are runnning out of stock. The quantity left is not enough for this transfer.';
                //$errors['item_ids'] = $t_item_ids2
            }

            //check for duplicate
            /**if(!p_order_validation_update($this->input->post('order_no'))) {

                    $ajax_data['success'] = 'duplicate';
                    $ajax_data['token_no'] = $items_tranfers_create_data['token_no'];
                    echo json_encode($ajax_data);
*/
            if (!empty($errors)) {
                //error found, let's notify the user of it
                $ajax_data = $errors;
                echo json_encode($ajax_data);
            } else {

                //collect data for each item bought
                for ($i = 0; $i < sizeof($input_ids_numeric); $i++) {

                    $items_tranfers_create_data['quantity'] = $this->input->post('quantity_transferred_' . $input_ids_numeric[$i]);

                        $items_tranfers_create_data['item_id'] = $this->input->post('item_transferred_' . $input_ids_numeric[$i]);

                        $items_tranfers_create_data['html_id'] = $input_ids_numeric[$i];

                        $items_tranfers_create_data['total_quantity'] = $this->input->post('hidden_total_quantity');
                    

                    //check if any required field is empty
                    if (empty($items_tranfers_create_data['quantity'])) {
                        $errors['quantity'] = 'Quantity trnasferred cannot be empty';
                    }

                    if (empty($items_tranfers_create_data['item_id'])) {
                        $errors['item_id'] = 'You must select an Item';
                    }


                    //if there's error
                    if (!empty($errors)) {
                        //error found, let's notify the user of it
                        $ajax_data = $errors;
                        echo json_encode($ajax_data);
                    } else {
                        //No error found, now we can update data
                        $item_id = $this->input->post('item_transferred_' . $input_ids_numeric[$i]);
                        //get previous quantity picked from the sales order table
                        $item_quantity['quantity'] = $this->db->get_where('items_transfers', array('token_no' => $token_no, 'item_id' => $item_id))->row()->quantity;

                        //incase the user added another item, let's insert it...
                        $item_rows = $this->db->get_where('items_transfers', array('token_no' => $token_no, 'item_id' => $item_id))->num_rows();

                        if ($item_rows < 1) {

                            $items_tranfers_create_data['date_timestamp'] = strtotime(date('d-m-Y'));
                            $items_tranfers_create_data['date'] = date('d-m-Y');

                            $this->db->insert('items_transfers', $items_tranfers_create_data);

                            //get s order id
                            $t_id = $this->db->insert_id();

                            
                            //update item table
                            $item_data['quantity'] = $this->input->post('quantity_transferred_' . $input_ids_numeric[$i]);
                            $item_data['last_used_timestamp'] = strtotime($this->input->post('transfer_date2'));
                            $item_id = $this->input->post('item_transferred_' . $input_ids_numeric[$i]);
                            //do update now
                            $this->db->where('item_id', $item_id);
                            $this->db->set('last_used_timestamp', $item_data['last_used_timestamp']);
                            $this->db->set('quantity', 'quantity - ' . $item_data['quantity'], FALSE);
                            $this->db->update('items');
                
                            
                        } else {
                        

                            //or let's do normal updates

                            $this->db->where('token_no', $token_no);
                            $this->db->where('item_id', $item_id);
                            $this->db->update('items_transfers', $items_tranfers_create_data);
                            

                            //normal editing...
                            
                            //update item table
                            //get the earlier quantity and add it before effecting the new update

                            //add it back
                            $this->db->where('item_id', $item_id);
                            $this->db->set('quantity', 'quantity + ' . $item_quantity['quantity'], FALSE);
                            $this->db->update('items');
                            //end of adjustment

                            $item_data['quantity'] = $this->input->post('quantity_transferred_' . $input_ids_numeric[$i]);
                            $item_data['last_used_timestamp'] = strtotime($this->input->post('transfer_date2'));

                            //do update now Subtract
                            $this->db->where('item_id', $item_id);
                            $this->db->set('last_used_timestamp', $item_data['last_used_timestamp']);
                            $this->db->set('quantity', 'quantity - ' . $item_data['quantity'], FALSE);
                            $this->db->update('items');

                        }

                        //grab the current item ids
                        array_push($_items_ids, $item_id);
                    }

                    
                } //End of loop

                if (empty($errors)) {
                    //incase user used different items apart from the earlier one, let's update it and delete it from the sales order table

                        $this->db->where('token_no', $token_no);
                        $this->db->where('receiver', $items_tranfers_create_data['receiver']);
                        $this->db->where_not_in('item_id', $_items_ids);
                        $items_ids_array = $this->db->get('items_transfers')->result_array();

                        foreach($items_ids_array as $item) {
                            //add the quantity back
                            $this->db->where('item_id', $item['item_id']);
                            $this->db->set('quantity', 'quantity + ' . $item['quantity'], FALSE);
                                $this->db->update('items');

                            //Now delete this row from items transfers table
                            $this->db->where('token_no', $item['token_no']);
                            $this->db->where('receiver', $items_tranfers_create_data['receiver']);
                            $this->db->where('item_id', $item['item_id']);
                            $this->db->delete('items_transfers');
                        }
                   

                        //UPDATE JOURNAL FOR DEBIT AMOUNT
                        $journal_data_rc['timestamp'] = strtotime($this->input->post('transfer_date'));
                        $journal_data_rc['date_timestamp'] = strtotime(date('d-m-Y H:i:s'));
                        $journal_data_rc['item_transfer_receiver'] = $this->input->post('transfer_to');
                        $journal_data_rc['journal'] = 'Items Transfer';
                        $journal_data_rc['debit_amount'] = $this->input->post('hidden_total_quantity');
                        $journal_data_rc['reference'] = '';
                        $journal_data_rc['description'] = 'Items Transferred to '. $journal_data_rc['item_transfer_receiver'];
                        $journal_data_rc['sales_person_id'] = $this->session->userdata('login_user_id');

                    //UPDATE NOW
                    $this->db->where('token_no', $token_no);
                    $this->db->where('credit_amount', 0);
                    $this->db->update('general_journal', $journal_data_rc);

                    //UPDATE JOURNAL FOR CREDIT AMOUNT
                    $journal_data_it['timestamp'] = strtotime($this->input->post('transfer_date'));
                    $journal_data_it['date_timestamp'] = strtotime(date('d-m-Y H:i:s'));

                    $journal_data_it['token_no'] = $this->input->post('token_no');
                    $journal_data_it['journal'] = 'Item Transfer';
                    $journal_data_it['credit_amount'] = $this->input->post('hidden_total_quantity');
                    $journal_data_it['reference'] = '';
                    $journal_data_it['description'] = 'Item(s) Transferred to '. $journal_data_it['item_transfer_receiver'];
                    $journal_data_it['sales_person_id'] = $this->session->userdata('login_user_id');

                    //UPDATE NOW
                    $this->db->where('token_no', $token_no);
                    $this->db->where('debit_amount', 0);
                    $this->db->update('general_journal', $journal_data_it);

                    ////return now
                    $ajax_data['success'] = true;
                    echo json_encode($ajax_data);
                }
                // }
            }

        }

        if ($param1 == 'delete') {
            //Delete Sales Order here'
            $token_no = $param2;

            //Track errors and success
            $errors = array();
            $ajax_data = array();

            $this->crud_model->delete_items_transfers($token_no);
            
        }

    }