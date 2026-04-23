variable "project"            {}
variable "env"                {}
variable "vpc_id"             {}
variable "subnet_ids"         { type = list(string) }
variable "db_username"        {}
variable "db_password"        {}
variable "eks_security_group" {}

resource "aws_security_group" "rds" {
  name   = "${var.project}-${var.env}-rds"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.eks_security_group]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.env}-db-subnet"
  subnet_ids = var.subnet_ids
}

resource "aws_db_instance" "postgres" {
  identifier              = "${var.project}-${var.env}-postgres"
  engine                  = "postgres"
  engine_version          = "16.2"
  instance_class          = "db.t3.medium"
  allocated_storage       = 20
  max_allocated_storage   = 100
  storage_encrypted       = true

  db_name  = "urlshortener"
  username = var.db_username
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period  = 7
  backup_window            = "03:00-04:00"
  maintenance_window       = "sun:04:00-sun:05:00"
  deletion_protection      = true
  skip_final_snapshot      = false
  final_snapshot_identifier = "${var.project}-${var.env}-final"

  performance_insights_enabled = true
  monitoring_interval          = 60

  tags = { Name = "${var.project}-${var.env}-postgres" }
}

output "endpoint" { value = aws_db_instance.postgres.endpoint }