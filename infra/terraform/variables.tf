variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name — prefixed on all resource names"
  type        = string
  default     = "url-shortener"
}

variable "env" {
  description = "Environment: dev | staging | prod"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "db_username" {
  type    = string
  default = "urluser"
}

variable "eks_node_instance_type" {
  type    = string
  default = "t3.medium"
}

variable "eks_desired_nodes" {
  type    = number
  default = 3
}

variable "eks_min_nodes" {
  type    = number
  default = 2
}

variable "eks_max_nodes" {
  type    = number
  default = 10
}