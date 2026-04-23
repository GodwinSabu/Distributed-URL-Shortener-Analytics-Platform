module "platform" {
  source = "../../"

  project                = "url-shortener"
  env                    = "dev"
  aws_region             = "us-east-1"
  vpc_cidr               = "10.0.0.0/16"
  db_password            = var.db_password
  eks_node_instance_type = "t3.medium"
  eks_desired_nodes      = 2
  eks_min_nodes          = 1
  eks_max_nodes          = 5
}

variable "db_password" {
  sensitive = true
}